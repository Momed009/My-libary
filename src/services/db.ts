import * as SQLite from 'expo-sqlite';

// Generate a UUID v4 for sync
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface Book {
  id: number;
  title: string;
  author: string;
  isbn: string;
  photo_path: string;
  created_at: string;
  status: 'read' | 'reading' | 'unread';
  favorite: number; // 0 or 1
  category_id: number | null;
  page_count: number;
  category_name?: string; // Joined value
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  book_count?: number; // Count of books associated
}

export interface Lending {
  id: number;
  book_id: number;
  borrower_name: string;
  borrow_date: string;
  return_date: string;
  returned: number; // 0 or 1
  calendar_event_id: string | null;
  book_title?: string;
  photo_path?: string;
}

export interface BookQuote {
  id: number;
  book_id: number;
  content: string;
  page: number | null;
  color_index: number; // 0-4 pastel design selections
  created_at: string;
}

const DATABASE_NAME = 'kutuphane.db';
let db: SQLite.SQLiteDatabase | null = null;

// Get or initialize database connection
export function getDbConnection(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DATABASE_NAME);
  }
  return db;
}

// Close database connection (useful before restore)
export async function closeDbConnection(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}

// Initialize database schema (supporting migrations safely)
export async function initDatabase(): Promise<void> {
  const database = getDbConnection();
  
  // 1. Create base tables
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT,
      isbn TEXT,
      photo_path TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      icon TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lendings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      borrower_name TEXT NOT NULL,
      borrow_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      returned INTEGER DEFAULT 0,
      calendar_event_id TEXT,
      FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS book_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      page INTEGER,
      color_index INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
    );
  `);

  // 2. Perform safe schema upgrades (ALTER TABLE) for existing installs
  try {
    await database.execAsync("ALTER TABLE books ADD COLUMN status TEXT DEFAULT 'unread';");
  } catch {}
  
  try {
    await database.execAsync("ALTER TABLE books ADD COLUMN favorite INTEGER DEFAULT 0;");
  } catch {}

  try {
    await database.execAsync("ALTER TABLE books ADD COLUMN category_id INTEGER;");
  } catch {}

  try {
    await database.execAsync("ALTER TABLE books ADD COLUMN page_count INTEGER DEFAULT 0;");
  } catch {}

  // Sync columns for books
  try { await database.execAsync("ALTER TABLE books ADD COLUMN uuid TEXT;"); } catch {}
  try { await database.execAsync("ALTER TABLE books ADD COLUMN updated_at TEXT;"); } catch {}
  try { await database.execAsync("ALTER TABLE books ADD COLUMN synced INTEGER DEFAULT 0;"); } catch {}
  try { await database.execAsync("ALTER TABLE books ADD COLUMN is_deleted INTEGER DEFAULT 0;"); } catch {}

  // Sync columns for lendings
  try { await database.execAsync("ALTER TABLE lendings ADD COLUMN uuid TEXT;"); } catch {}
  try { await database.execAsync("ALTER TABLE lendings ADD COLUMN updated_at TEXT;"); } catch {}
  try { await database.execAsync("ALTER TABLE lendings ADD COLUMN synced INTEGER DEFAULT 0;"); } catch {}
  try { await database.execAsync("ALTER TABLE lendings ADD COLUMN is_deleted INTEGER DEFAULT 0;"); } catch {}

  // Sync columns for book_quotes
  try { await database.execAsync("ALTER TABLE book_quotes ADD COLUMN uuid TEXT;"); } catch {}
  try { await database.execAsync("ALTER TABLE book_quotes ADD COLUMN updated_at TEXT;"); } catch {}
  try { await database.execAsync("ALTER TABLE book_quotes ADD COLUMN synced INTEGER DEFAULT 0;"); } catch {}
  try { await database.execAsync("ALTER TABLE book_quotes ADD COLUMN is_deleted INTEGER DEFAULT 0;"); } catch {}

  // Backfill UUIDs for existing records that don't have one
  const booksWithoutUuid = await database.getAllAsync<{ id: number }>('SELECT id FROM books WHERE uuid IS NULL');
  for (const row of booksWithoutUuid) {
    await database.runAsync('UPDATE books SET uuid = ?, updated_at = ? WHERE id = ?', generateUUID(), new Date().toISOString(), row.id);
  }
  const lendingsWithoutUuid = await database.getAllAsync<{ id: number }>('SELECT id FROM lendings WHERE uuid IS NULL');
  for (const row of lendingsWithoutUuid) {
    await database.runAsync('UPDATE lendings SET uuid = ?, updated_at = ? WHERE id = ?', generateUUID(), new Date().toISOString(), row.id);
  }
  const quotesWithoutUuid = await database.getAllAsync<{ id: number }>('SELECT id FROM book_quotes WHERE uuid IS NULL');
  for (const row of quotesWithoutUuid) {
    await database.runAsync('UPDATE book_quotes SET uuid = ?, updated_at = ? WHERE id = ?', generateUUID(), new Date().toISOString(), row.id);
  }

  // 3. Create indexes for faster queries (dramatically reduces CPU for list operations)
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
    CREATE INDEX IF NOT EXISTS idx_books_favorite ON books(favorite);
    CREATE INDEX IF NOT EXISTS idx_books_category_id ON books(category_id);
    CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
    CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
    CREATE INDEX IF NOT EXISTS idx_books_uuid ON books(uuid);
    CREATE INDEX IF NOT EXISTS idx_lendings_returned ON lendings(returned);
    CREATE INDEX IF NOT EXISTS idx_lendings_book_id ON lendings(book_id);
    CREATE INDEX IF NOT EXISTS idx_lendings_uuid ON lendings(uuid);
    CREATE INDEX IF NOT EXISTS idx_book_quotes_book_id ON book_quotes(book_id);
    CREATE INDEX IF NOT EXISTS idx_book_quotes_uuid ON book_quotes(uuid);
  `);

  // 4. Pre-populate default categories
  const countResult = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM categories');
  if (countResult && countResult.count === 0) {
    const defaultCategories = [
      { name: 'Roman', icon: 'book' },
      { name: 'Tarih', icon: 'time' },
      { name: 'Felsefe', icon: 'bulb' },
      { name: 'Şiir', icon: 'create' },
      { name: 'Din', icon: 'sunny' },
      { name: 'Bilim', icon: 'flask' },
      { name: 'Kişisel Gelişim', icon: 'trending-up' },
      { name: 'Psikoloji', icon: 'people' },
      { name: 'Sanat', icon: 'color-palette' },
      { name: 'İş / Ekonomi', icon: 'cash' },
      { name: 'Çocuk', icon: 'happy' },
      { name: 'Eğitim', icon: 'school' },
      { name: 'Siyaset', icon: 'ribbon' },
      { name: 'Biyografi', icon: 'person' },
      { name: 'Diğer', icon: 'ellipsis-horizontal' }
    ];
    for (const cat of defaultCategories) {
      await database.runAsync('INSERT OR IGNORE INTO categories (name, icon) VALUES (?, ?)', cat.name, cat.icon);
    }
  }
}

// Add a book
export async function addBook(
  title: string,
  author: string,
  isbn: string | null,
  photoPath: string | null,
  pageCount: number = 0,
  categoryId: number | null = null
): Promise<number> {
  const database = getDbConnection();
  const createdAt = new Date().toISOString();
  const uuid = generateUUID();
  
  const result = await database.runAsync(
    `INSERT INTO books (title, author, isbn, photo_path, created_at, status, favorite, category_id, page_count, uuid, updated_at, synced, is_deleted) VALUES (?, ?, ?, ?, ?, 'unread', 0, ?, ?, ?, ?, 0, 0)`,
    title.trim(),
    author ? author.trim() : '',
    isbn ? isbn.trim() : '',
    photoPath || '',
    createdAt,
    categoryId,
    pageCount,
    uuid,
    createdAt
  );
  
  return result.lastInsertRowId;
}

// Update a book's metadata entirely
export async function updateBook(
  id: number,
  title: string,
  author: string,
  isbn: string,
  pageCount: number,
  categoryId: number | null,
  photoPath: string | null
): Promise<void> {
  const database = getDbConnection();
  const updatedAt = new Date().toISOString();
  await database.runAsync(
    `UPDATE books SET title = ?, author = ?, isbn = ?, page_count = ?, category_id = ?, photo_path = ?, updated_at = ?, synced = 0 WHERE id = ?`,
    title.trim(),
    author ? author.trim() : '',
    isbn ? isbn.trim() : '',
    pageCount,
    categoryId,
    photoPath,
    updatedAt,
    id
  );
}

// Get all books ordered by creation date (including category name), excluding soft-deleted
export async function getAllBooks(): Promise<Book[]> {
  const database = getDbConnection();
  return await database.getAllAsync<Book>(
    `SELECT b.*, c.name as category_name 
     FROM books b 
     LEFT JOIN categories c ON b.category_id = c.id 
     WHERE b.is_deleted = 0 OR b.is_deleted IS NULL
     ORDER BY b.created_at DESC`
  );
}

// Search books by title or author
export async function searchBooks(query: string): Promise<Book[]> {
  const database = getDbConnection();
  const searchQuery = `%${query.trim()}%`;
  return await database.getAllAsync<Book>(
    `SELECT b.*, c.name as category_name 
     FROM books b 
     LEFT JOIN categories c ON b.category_id = c.id 
     WHERE b.title LIKE ? OR b.author LIKE ? 
     ORDER BY b.title ASC`,
    searchQuery,
    searchQuery
  );
}

// Get filtered list of books
export async function getFilteredBooks(filters: {
  status?: 'read' | 'reading' | 'unread';
  favorite?: boolean;
  categoryId?: number;
}): Promise<Book[]> {
  const database = getDbConnection();
  let sql = `SELECT b.*, c.name as category_name FROM books b LEFT JOIN categories c ON b.category_id = c.id WHERE 1=1`;
  const params: any[] = [];

  if (filters.status) {
    sql += ` AND b.status = ?`;
    params.push(filters.status);
  }
  if (filters.favorite !== undefined) {
    sql += ` AND b.favorite = ?`;
    params.push(filters.favorite ? 1 : 0);
  }
  if (filters.categoryId) {
    sql += ` AND b.category_id = ?`;
    params.push(filters.categoryId);
  }

  sql += ` ORDER BY b.created_at DESC`;
  return await database.getAllAsync<Book>(sql, ...params);
}

// Check if a book already exists by ISBN
export async function checkBookByIsbn(isbn: string): Promise<Book | null> {
  if (!isbn || isbn.trim() === '') return null;
  const database = getDbConnection();
  return await database.getFirstAsync<Book>(
    'SELECT * FROM books WHERE isbn = ?',
    isbn.trim()
  );
}

// Check if a book already exists by exact title (case-insensitive check)
export async function checkBookByTitleAndAuthor(title: string, author: string): Promise<Book | null> {
  const database = getDbConnection();
  return await database.getFirstAsync<Book>(
    'SELECT * FROM books WHERE LOWER(title) = LOWER(?) AND LOWER(author) = LOWER(?)',
    title.trim(),
    author.trim()
  );
}

// Soft-delete a book (mark as deleted for sync, then hard-delete locally)
export async function deleteBook(id: number): Promise<void> {
  const database = getDbConnection();
  const updatedAt = new Date().toISOString();
  // Mark as deleted and unsynced so the delete propagates to cloud
  await database.runAsync('UPDATE books SET is_deleted = 1, updated_at = ?, synced = 0 WHERE id = ?', updatedAt, id);
}

// Update reading status
export async function updateBookReadingStatus(id: number, status: 'read' | 'reading' | 'unread'): Promise<void> {
  const database = getDbConnection();
  const updatedAt = new Date().toISOString();
  await database.runAsync('UPDATE books SET status = ?, updated_at = ?, synced = 0 WHERE id = ?', status, updatedAt, id);
}

// Update favorite status
export async function updateBookFavoriteStatus(id: number, isFavorite: boolean): Promise<void> {
  const database = getDbConnection();
  const updatedAt = new Date().toISOString();
  await database.runAsync('UPDATE books SET favorite = ?, updated_at = ?, synced = 0 WHERE id = ?', isFavorite ? 1 : 0, updatedAt, id);
}

// Associate book to category
export async function associateBookToCategory(bookId: number, categoryId: number | null): Promise<void> {
  const database = getDbConnection();
  await database.runAsync('UPDATE books SET category_id = ? WHERE id = ?', categoryId, bookId);
}

// --- CATEGORY CRUD ---

// Get all categories along with count of books in each
export async function getAllCategories(): Promise<Category[]> {
  const database = getDbConnection();
  return await database.getAllAsync<Category>(
    `SELECT c.*, COUNT(b.id) as book_count 
     FROM categories c 
     LEFT JOIN books b ON b.category_id = c.id 
     GROUP BY c.id 
     ORDER BY c.name ASC`
  );
}

// Add a new custom category
export async function addCategory(name: string, icon: string): Promise<number> {
  const database = getDbConnection();
  const result = await database.runAsync(
    'INSERT INTO categories (name, icon) VALUES (?, ?)',
    name.trim(),
    icon
  );
  return result.lastInsertRowId;
}

// Update custom category
export async function updateCategory(id: number, name: string, icon: string): Promise<void> {
  const database = getDbConnection();
  await database.runAsync(
    'UPDATE categories SET name = ?, icon = ? WHERE id = ?',
    name.trim(),
    icon,
    id
  );
}

// Delete custom category
export async function deleteCategory(id: number): Promise<void> {
  const database = getDbConnection();
  // Set category_id to NULL on all books belonging to this category
  await database.runAsync('UPDATE books SET category_id = NULL WHERE category_id = ?', id);
  // Delete the category itself
  await database.runAsync('DELETE FROM categories WHERE id = ?', id);
}

// Find category ID by name (case-insensitive lookup, helpful for automated API mapping)
export async function findCategoryIdByName(name: string): Promise<number | null> {
  const database = getDbConnection();
  const cat = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM categories WHERE LOWER(name) = LOWER(?)',
    name.trim()
  );
  return cat ? cat.id : null;
}

// --- LENDING CRUD ---

// Add a lending record
export async function addLending(
  bookId: number,
  borrowerName: string,
  returnDate: string,
  calendarEventId: string | null
): Promise<number> {
  const database = getDbConnection();
  const borrowDate = new Date().toISOString();
  const uuid = generateUUID();
  
  const result = await database.runAsync(
    `INSERT INTO lendings (book_id, borrower_name, borrow_date, return_date, returned, calendar_event_id, uuid, updated_at, synced, is_deleted) VALUES (?, ?, ?, ?, 0, ?, ?, ?, 0, 0)`,
    bookId,
    borrowerName.trim(),
    borrowDate,
    returnDate,
    calendarEventId,
    uuid,
    borrowDate
  );
  
  return result.lastInsertRowId;
}

// Get all active (not returned) lendings
export async function getActiveLendings(): Promise<Lending[]> {
  const database = getDbConnection();
  return await database.getAllAsync<Lending>(
    `SELECT l.*, b.title as book_title, b.photo_path 
     FROM lendings l 
     JOIN books b ON l.book_id = b.id 
     WHERE l.returned = 0 
     ORDER BY l.return_date ASC`
  );
}

// Mark lending as returned. Returns the calendar event id (if any) to support cancellation.
export async function returnLending(id: number): Promise<string | null> {
  const database = getDbConnection();
  const lending = await database.getFirstAsync<Lending>(
    'SELECT calendar_event_id FROM lendings WHERE id = ?',
    id
  );
  
  const updatedAt = new Date().toISOString();
  await database.runAsync('UPDATE lendings SET returned = 1, updated_at = ?, synced = 0 WHERE id = ?', updatedAt, id);
  
  return lending ? lending.calendar_event_id : null;
}

// --- STATISTICS QUERY ---

export interface LibraryStats {
  totalBooks: number;
  readCount: number;
  readingCount: number;
  unreadCount: number;
  favoriteCount: number;
  lentCount: number;
  totalPages: number;
}

export async function getLibraryStats(): Promise<LibraryStats> {
  const database = getDbConnection();
  
  const counts = await database.getFirstAsync<{
    total: number;
    read: number;
    reading: number;
    unread: number;
    favorites: number;
    pages: number;
  }>(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read,
      SUM(CASE WHEN status = 'reading' THEN 1 ELSE 0 END) as reading,
      SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END) as unread,
      SUM(CASE WHEN favorite = 1 THEN 1 ELSE 0 END) as favorites,
      SUM(COALESCE(page_count, 0)) as pages
    FROM books
  `);

  const activeLendingsCount = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM lendings WHERE returned = 0'
  );

  return {
    totalBooks: counts?.total || 0,
    readCount: counts?.read || 0,
    readingCount: counts?.reading || 0,
    unreadCount: counts?.unread || 0,
    favoriteCount: counts?.favorites || 0,
    lentCount: activeLendingsCount?.count || 0,
    totalPages: counts?.pages || 0
  };
}

// --- SETTINGS CRUD ---

export async function getSetting(key: string, defaultValue: string): Promise<string> {
  try {
    const database = getDbConnection();
    const result = await database.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
    return result ? result.value : defaultValue;
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return defaultValue;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  try {
    const database = getDbConnection();
    await database.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
  } catch (error) {
    console.error(`Error setting setting ${key}:`, error);
  }
}

// --- BOOK QUOTES CRUD ---

export async function addBookQuote(
  bookId: number,
  content: string,
  page: number | null,
  colorIndex: number = 0
): Promise<number> {
  const database = getDbConnection();
  const createdAt = new Date().toISOString();
  const uuid = generateUUID();
  const result = await database.runAsync(
    'INSERT INTO book_quotes (book_id, content, page, color_index, created_at, uuid, updated_at, synced, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)',
    bookId,
    content.trim(),
    page,
    colorIndex,
    createdAt,
    uuid,
    createdAt
  );
  return result.lastInsertRowId;
}

export async function deleteBookQuote(id: number): Promise<void> {
  const database = getDbConnection();
  const updatedAt = new Date().toISOString();
  await database.runAsync('UPDATE book_quotes SET is_deleted = 1, updated_at = ?, synced = 0 WHERE id = ?', updatedAt, id);
}

export async function getBookQuotes(bookId: number): Promise<BookQuote[]> {
  const database = getDbConnection();
  const rows = await database.getAllAsync<any>(
    'SELECT * FROM book_quotes WHERE book_id = ? ORDER BY id DESC',
    bookId
  );
  return rows.map(row => ({
    id: row.id,
    book_id: row.book_id,
    content: row.content,
    page: row.page,
    color_index: row.color_index,
    created_at: row.created_at
  }));
}

