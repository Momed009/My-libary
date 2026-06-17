import { supabase } from './supabase';
import { getDbConnection } from './db';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_SYNC_KEY = 'last_sync_timestamp';
const COVERS_DIRECTORY = `${FileSystem.documentDirectory}book_covers/`;

// Get last sync timestamp
async function getLastSyncTime(): Promise<string> {
  const ts = await AsyncStorage.getItem(LAST_SYNC_KEY);
  return ts || '1970-01-01T00:00:00.000Z';
}

// Update last sync timestamp
async function setLastSyncTime(ts: string): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNC_KEY, ts);
}

// Upload a local cover image to Supabase Storage
async function uploadCoverImage(localPath: string, userId: string, uuid: string): Promise<string | null> {
  try {
    if (!localPath || localPath.trim() === '') return null;

    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (!fileInfo.exists) return null;

    const base64 = await FileSystem.readAsStringAsync(localPath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const ext = localPath.split('.').pop() || 'jpg';
    const filePath = `${userId}/${uuid}.${ext}`;

    const { error } = await supabase.storage
      .from('book-covers')
      .upload(filePath, decode(base64), {
        contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
        upsert: true,
      });

    if (error) {
      console.warn('Cover upload error:', error);
      return null;
    }

    const { data } = supabase.storage
      .from('book-covers')
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error) {
    console.error('Error uploading cover:', error);
    return null;
  }
}

// Download a remote cover image to local storage
async function downloadCoverImage(remoteUrl: string, uuid: string): Promise<string | null> {
  try {
    if (!remoteUrl || remoteUrl.trim() === '') return null;

    const ext = remoteUrl.split('.').pop()?.split('?')[0] || 'jpg';
    const localPath = `${COVERS_DIRECTORY}cover_${uuid}.${ext}`;

    const downloadResult = await FileSystem.downloadAsync(remoteUrl, localPath);
    if (downloadResult.status === 200) {
      return downloadResult.uri;
    }
    return null;
  } catch (error) {
    console.error('Error downloading cover:', error);
    return null;
  }
}

// Push local changes to Supabase
export async function pushLocalChanges(userId: string): Promise<number> {
  try {
  const db = getDbConnection();
  let pushCount = 0;

  // 1. Push books
  const unsyncedBooks = await db.getAllAsync<any>(
    'SELECT * FROM books WHERE synced = 0'
  );

  for (const book of unsyncedBooks) {
    let cloudPhotoUrl: string | null = null;

    // Upload cover image if it exists and is a local file
    if (book.photo_path && !book.photo_path.startsWith('http')) {
      cloudPhotoUrl = await uploadCoverImage(book.photo_path, userId, book.uuid);
    }

    const { error } = await supabase
      .from('books')
      .upsert({
        uuid: book.uuid,
        user_id: userId,
        title: book.title,
        author: book.author || '',
        isbn: book.isbn || '',
        photo_url: cloudPhotoUrl || book.photo_path || '',
        status: book.status || 'unread',
        favorite: book.favorite || 0,
        category_id: book.category_id,
        page_count: book.page_count || 0,
        created_at: book.created_at,
        updated_at: book.updated_at,
        is_deleted: book.is_deleted || 0,
      }, { onConflict: 'uuid' });

    if (!error) {
      await db.runAsync('UPDATE books SET synced = 1 WHERE id = ?', book.id);
      pushCount++;
    } else {
      console.warn('Push book error:', error);
    }
  }

  // 2. Push lendings
  const unsyncedLendings = await db.getAllAsync<any>(
    'SELECT * FROM lendings WHERE synced = 0'
  );

  for (const lending of unsyncedLendings) {
    // Get the parent book's uuid
    const parentBook = await db.getFirstAsync<any>(
      'SELECT uuid FROM books WHERE id = ?', lending.book_id
    );

    if (!parentBook?.uuid) {
      console.warn('Skipping lending push: parent book UUID not found for lending', lending.id);
      continue;
    }

    const { error } = await supabase
      .from('lendings')
      .upsert({
        uuid: lending.uuid,
        user_id: userId,
        book_uuid: parentBook.uuid,
        borrower_name: lending.borrower_name,
        borrow_date: lending.borrow_date,
        return_date: lending.return_date,
        returned: lending.returned || 0,
        calendar_event_id: lending.calendar_event_id,
        updated_at: lending.updated_at,
        is_deleted: lending.is_deleted || 0,
      }, { onConflict: 'uuid' });

    if (!error) {
      await db.runAsync('UPDATE lendings SET synced = 1 WHERE id = ?', lending.id);
      pushCount++;
    } else {
      console.warn('Push lending error:', error);
    }
  }

  // 3. Push book quotes
  const unsyncedQuotes = await db.getAllAsync<any>(
    'SELECT * FROM book_quotes WHERE synced = 0'
  );

  for (const quote of unsyncedQuotes) {
    const parentBook = await db.getFirstAsync<any>(
      'SELECT uuid FROM books WHERE id = ?', quote.book_id
    );

    if (!parentBook?.uuid) {
      console.warn('Skipping quote push: parent book UUID not found for quote', quote.id);
      continue;
    }

    const { error } = await supabase
      .from('book_quotes')
      .upsert({
        uuid: quote.uuid,
        user_id: userId,
        book_uuid: parentBook.uuid,
        content: quote.content,
        page: quote.page,
        color_index: quote.color_index || 0,
        created_at: quote.created_at,
        updated_at: quote.updated_at,
        is_deleted: quote.is_deleted || 0,
      }, { onConflict: 'uuid' });

    if (!error) {
      await db.runAsync('UPDATE book_quotes SET synced = 1 WHERE id = ?', quote.id);
      pushCount++;
    } else {
      console.warn('Push quote error:', error);
    }
  }

  return pushCount;
  } catch (error) {
    console.error('Error pushing local changes:', error);
    return 0;
  }
}

// Pull remote changes from Supabase
export async function pullRemoteChanges(userId: string): Promise<number> {
  try {
  const db = getDbConnection();
  const lastSync = await getLastSyncTime();
  let pullCount = 0;

  // 1. Pull books
  const { data: remoteBooks, error: booksError } = await supabase
    .from('books')
    .select('*')
    .eq('user_id', userId)
    .gt('updated_at', lastSync);

  if (!booksError && remoteBooks) {
    for (const rb of remoteBooks) {
      const localBook = await db.getFirstAsync<any>(
        'SELECT * FROM books WHERE uuid = ?', rb.uuid
      );

      if (localBook) {
        // Compare timestamps - remote is newer
        if (new Date(rb.updated_at) > new Date(localBook.updated_at)) {
          // Download cover if remote has a URL and it's different
          let localPhotoPath = localBook.photo_path;
          if (rb.photo_url && rb.photo_url.startsWith('http') && rb.photo_url !== localBook.photo_path) {
            const downloaded = await downloadCoverImage(rb.photo_url, rb.uuid);
            if (downloaded) localPhotoPath = downloaded;
          }

          if (rb.is_deleted) {
            await db.runAsync('UPDATE books SET is_deleted = 1, synced = 1, updated_at = ? WHERE uuid = ?', rb.updated_at, rb.uuid);
          } else {
            await db.runAsync(
              `UPDATE books SET title = ?, author = ?, isbn = ?, photo_path = ?, status = ?, favorite = ?, category_id = ?, page_count = ?, updated_at = ?, is_deleted = ?, synced = 1 WHERE uuid = ?`,
              rb.title, rb.author, rb.isbn, localPhotoPath, rb.status, rb.favorite, rb.category_id, rb.page_count, rb.updated_at, rb.is_deleted, rb.uuid
            );
          }
          pullCount++;
        }
      } else if (!rb.is_deleted) {
        // New book from cloud - download cover
        let localPhotoPath = '';
        if (rb.photo_url && rb.photo_url.startsWith('http')) {
          const downloaded = await downloadCoverImage(rb.photo_url, rb.uuid);
          if (downloaded) localPhotoPath = downloaded;
        }

        await db.runAsync(
          `INSERT INTO books (uuid, title, author, isbn, photo_path, created_at, status, favorite, category_id, page_count, updated_at, synced, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
          rb.uuid, rb.title, rb.author || '', rb.isbn || '', localPhotoPath, rb.created_at, rb.status || 'unread', rb.favorite || 0, rb.category_id, rb.page_count || 0, rb.updated_at
        );
        pullCount++;
      }
    }
  }

  // 2. Pull lendings
  const { data: remoteLendings, error: lendingsError } = await supabase
    .from('lendings')
    .select('*')
    .eq('user_id', userId)
    .gt('updated_at', lastSync);

  if (!lendingsError && remoteLendings) {
    for (const rl of remoteLendings) {
      const localLending = await db.getFirstAsync<any>(
        'SELECT * FROM lendings WHERE uuid = ?', rl.uuid
      );
      // Find parent book by uuid
      const parentBook = await db.getFirstAsync<any>(
        'SELECT id FROM books WHERE uuid = ?', rl.book_uuid
      );
      const bookId = parentBook?.id || 0;

      if (localLending) {
        if (new Date(rl.updated_at) > new Date(localLending.updated_at)) {
          if (bookId === 0) {
            console.warn('Skipping lending update: book not found locally for lending', rl.uuid);
            continue;
          }
          await db.runAsync(
            `UPDATE lendings SET book_id = ?, borrower_name = ?, borrow_date = ?, return_date = ?, returned = ?, calendar_event_id = ?, updated_at = ?, is_deleted = ?, synced = 1 WHERE uuid = ?`,
            bookId, rl.borrower_name, rl.borrow_date, rl.return_date, rl.returned, rl.calendar_event_id, rl.updated_at, rl.is_deleted, rl.uuid
          );
          pullCount++;
        }
      } else if (!rl.is_deleted && bookId > 0) {
        await db.runAsync(
          `INSERT INTO lendings (uuid, book_id, borrower_name, borrow_date, return_date, returned, calendar_event_id, updated_at, synced, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
          rl.uuid, bookId, rl.borrower_name, rl.borrow_date, rl.return_date, rl.returned || 0, rl.calendar_event_id, rl.updated_at
        );
        pullCount++;
      }
    }
  }

  // 3. Pull book quotes
  const { data: remoteQuotes, error: quotesError } = await supabase
    .from('book_quotes')
    .select('*')
    .eq('user_id', userId)
    .gt('updated_at', lastSync);

  if (!quotesError && remoteQuotes) {
    for (const rq of remoteQuotes) {
      const localQuote = await db.getFirstAsync<any>(
        'SELECT * FROM book_quotes WHERE uuid = ?', rq.uuid
      );
      const parentBook = await db.getFirstAsync<any>(
        'SELECT id FROM books WHERE uuid = ?', rq.book_uuid
      );
      const bookId = parentBook?.id || 0;

      if (localQuote) {
        if (new Date(rq.updated_at) > new Date(localQuote.updated_at)) {
          if (bookId === 0) {
            console.warn('Skipping quote update: book not found locally for quote', rq.uuid);
            continue;
          }
          await db.runAsync(
            `UPDATE book_quotes SET book_id = ?, content = ?, page = ?, color_index = ?, updated_at = ?, is_deleted = ?, synced = 1 WHERE uuid = ?`,
            bookId, rq.content, rq.page, rq.color_index, rq.updated_at, rq.is_deleted, rq.uuid
          );
          pullCount++;
        }
      } else if (!rq.is_deleted && bookId > 0) {
        await db.runAsync(
          `INSERT INTO book_quotes (uuid, book_id, content, page, color_index, created_at, updated_at, synced, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
          rq.uuid, bookId, rq.content, rq.page, rq.color_index || 0, rq.created_at, rq.updated_at
        );
        pullCount++;
      }
    }
  }

  // Update last sync timestamp
  await setLastSyncTime(new Date().toISOString());
  return pullCount;
  } catch (error) {
    console.error('Error pulling remote changes:', error);
    return 0;
  }
}

// Full sync: push then pull
export async function performFullSync(userId: string): Promise<{ pushed: number; pulled: number }> {
  let pushed = 0;
  let pulled = 0;
  try {
    pushed = await pushLocalChanges(userId);
  } catch (error) {
    console.error('Push failed during full sync:', error);
  }
  try {
    pulled = await pullRemoteChanges(userId);
  } catch (error) {
    console.error('Pull failed during full sync:', error);
  }
  return { pushed, pulled };
}
