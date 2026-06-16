import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import JSZip from 'jszip';
import { initDatabase, closeDbConnection } from './db';

// Persistent directory for storing book cover images
const COVERS_DIRECTORY = `${FileSystem.documentDirectory}book_covers/`;
const SQLITE_DIRECTORY = `${FileSystem.documentDirectory}SQLite/`;
const DB_FILE_PATH = `${SQLITE_DIRECTORY}kutuphane.db`;

// Ensure folders exist
export async function initFileSystem(): Promise<void> {
  const coversDirInfo = await FileSystem.getInfoAsync(COVERS_DIRECTORY);
  if (!coversDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(COVERS_DIRECTORY, { intermediates: true });
  }
}

// Copy photo to persistent directory and return the persistent URI
export async function saveBookCover(tempUri: string): Promise<string> {
  await initFileSystem();
  
  // Extract file extension and generate unique name
  const extension = tempUri.split('.').pop() || 'jpg';
  const fileName = `cover_${Date.now()}_${Math.floor(Math.random() * 1000)}.${extension}`;
  const persistentUri = `${COVERS_DIRECTORY}${fileName}`;
  
  await FileSystem.copyAsync({
    from: tempUri,
    to: persistentUri
  });
  
  return persistentUri;
}

// Delete persistent photo
export async function deleteBookCover(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch (error) {
    console.error('Error deleting image file:', error);
  }
}

// Backup database and photos to a ZIP file and share it via OS Share Menu
export async function createAndShareBackup(): Promise<boolean> {
  try {
    await initFileSystem();
    
    // Check if database file exists
    const dbInfo = await FileSystem.getInfoAsync(DB_FILE_PATH);
    if (!dbInfo.exists) {
      throw new Error('Veritabanı dosyası bulunamadı. Önce kitap eklemelisiniz.');
    }
    
    const zip = new JSZip();
    
    // 1. Add database file to zip
    const dbBase64 = await FileSystem.readAsStringAsync(DB_FILE_PATH, {
      encoding: FileSystem.EncodingType.Base64
    });
    zip.file('kutuphane.db', dbBase64, { base64: true });
    
    // 2. Add all local book cover images to zip
    const files = await FileSystem.readDirectoryAsync(COVERS_DIRECTORY);
    for (const fileName of files) {
      const fileUri = `${COVERS_DIRECTORY}${fileName}`;
      const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64
      });
      zip.file(`book_covers/${fileName}`, fileBase64, { base64: true });
    }
    
    // 3. Generate the ZIP file as Base64
    const zipBase64 = await zip.generateAsync({ type: 'base64' });
    
    // 4. Save ZIP to cache directory
    const dateStr = new Date().toISOString().slice(0, 10);
    const backupFileName = `kutuphane_yedek_${dateStr}.zip`;
    const backupUri = `${FileSystem.cacheDirectory}${backupFileName}`;
    
    await FileSystem.writeAsStringAsync(backupUri, zipBase64, {
      encoding: FileSystem.EncodingType.Base64
    });
    
    // 5. Share the file (Google Drive / iCloud / AirDrop / WhatsApp)
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Dosya paylaşımı bu cihazda desteklenmiyor.');
    }
    
    await Sharing.shareAsync(backupUri, {
      mimeType: 'application/zip',
      dialogTitle: 'Kütüphaneyi Yedekle',
      UTI: 'public.archive' // Required for iOS to understand it's a zip file
    });
    
    return true;
  } catch (error) {
    console.error('Yedekleme hatası:', error);
    throw error;
  }
}

// Restore database and photos from a user-selected ZIP file
export async function restoreBackup(): Promise<boolean> {
  try {
    // 1. Select the ZIP file using Document Picker
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/zip',
      copyToCacheDirectory: true
    });
    
    if (result.canceled || !result.assets || result.assets.length === 0) {
      return false; // User cancelled
    }
    
    const selectedFile = result.assets[0];
    const zipUri = selectedFile.uri;
    
    // 2. Read ZIP file content as Base64
    const zipBase64 = await FileSystem.readAsStringAsync(zipUri, {
      encoding: FileSystem.EncodingType.Base64
    });
    
    // 3. Load ZIP using JSZip
    const zip = new JSZip();
    await zip.loadAsync(zipBase64, { base64: true });
    
    // Verify backup content
    const dbFile = zip.file('kutuphane.db');
    if (!dbFile) {
      throw new Error('Seçilen dosya geçerli bir kütüphane yedeği değil ("kutuphane.db" bulunamadı).');
    }
    
    // 4. Close database connection to prevent write conflicts
    await closeDbConnection();
    
    // 5. Restore database file
    const dbBase64Restored = await dbFile.async('base64');
    const sqliteDirInfo = await FileSystem.getInfoAsync(SQLITE_DIRECTORY);
    if (!sqliteDirInfo.exists) {
      await FileSystem.makeDirectoryAsync(SQLITE_DIRECTORY, { intermediates: true });
    }
    await FileSystem.writeAsStringAsync(DB_FILE_PATH, dbBase64Restored, {
      encoding: FileSystem.EncodingType.Base64
    });
    
    // 6. Restore cover images
    // Re-create covers directory (cleaning it first to prevent duplicates/orphan files)
    const coversDirInfo = await FileSystem.getInfoAsync(COVERS_DIRECTORY);
    if (coversDirInfo.exists) {
      await FileSystem.deleteAsync(COVERS_DIRECTORY, { idempotent: true });
    }
    await FileSystem.makeDirectoryAsync(COVERS_DIRECTORY, { intermediates: true });
    
    const bookCoversFolder = zip.folder('book_covers');
    if (bookCoversFolder) {
      const filesKeys = Object.keys(bookCoversFolder.files);
      for (const key of filesKeys) {
        const file = bookCoversFolder.file(key);
        if (file && !file.dir) {
          const fileName = key.replace('book_covers/', '');
          const fileBase64 = await file.async('base64');
          await FileSystem.writeAsStringAsync(`${COVERS_DIRECTORY}${fileName}`, fileBase64, {
            encoding: FileSystem.EncodingType.Base64
          });
        }
      }
    }
    
    // 7. Re-initialize database connection
    await initDatabase();
    
    return true;
  } catch (error) {
    console.error('Yedekten geri yükleme hatası:', error);
    // Ensure database is initialized even on failure to avoid app crashes
    try {
      await initDatabase();
    } catch {}
    throw error;
  }
}
