import * as FileSystem from 'expo-file-system/legacy';
import { saveBookCover } from './fs';
import { findCategoryIdByName } from './db';

export interface BookApiInfo {
  title: string;
  author: string;
  photoUrl?: string;
  isbn: string;
  pageCount: number;
  categoryId: number | null;
}

// Map English categories to Turkish categories
const GENRE_TRANSLATION_MAP: { [key: string]: string } = {
  'fiction': 'Roman',
  'literature': 'Roman',
  'novel': 'Roman',
  'history': 'Tarih',
  'philosophy': 'Felsefe',
  'poetry': 'Şiir',
  'religion': 'Din',
  'science': 'Bilim',
  'self-help': 'Kişisel Gelişim',
  'psychology': 'Psikoloji',
  'art': 'Sanat',
  'business': 'İş / Ekonomi',
  'economics': 'İş / Ekonomi',
  'finance': 'İş / Ekonomi',
  'juvenile fiction': 'Çocuk',
  'children': 'Çocuk',
  'education': 'Eğitim',
  'political science': 'Siyaset',
  'politics': 'Siyaset',
  'biography': 'Biyografi',
  'drama': 'Tiyatro'
};

// Resolve Turkish category ID from raw API categories array
async function resolveCategoryId(apiCategories: string[] | undefined): Promise<number | null> {
  if (!apiCategories || apiCategories.length === 0) {
    return await findCategoryIdByName('Diğer');
  }

  const primaryCategory = apiCategories[0].toLowerCase().trim();
  let mappedCategoryName = 'Diğer';

  for (const [englishGenre, turkishName] of Object.entries(GENRE_TRANSLATION_MAP)) {
    if (primaryCategory.includes(englishGenre)) {
      mappedCategoryName = turkishName;
      break;
    }
  }

  return await findCategoryIdByName(mappedCategoryName);
}

// Fetch book metadata from Google Books or Open Library APIs
export async function fetchBookInfoByIsbn(isbn: string): Promise<BookApiInfo | null> {
  const cleanIsbn = isbn.replace(/[-\s]/g, '');
  if (!cleanIsbn) return null;

  try {
    // 1. Try Google Books API
    const googleResponse = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`
    );
    if (googleResponse.ok) {
      const data = await googleResponse.json();
      if (data.items && data.items.length > 0) {
        const volumeInfo = data.items[0].volumeInfo;
        const volumeId = data.items[0].id;
        const title = volumeInfo.title || '';
        const author = volumeInfo.authors ? volumeInfo.authors.join(', ') : '';
        const pageCount = volumeInfo.pageCount || 0;

        // Try to get high-res cover from volume-specific endpoint
        let photoUrl: string | undefined = undefined;
        try {
          const volumeResponse = await fetch(
            `https://www.googleapis.com/books/v1/volumes/${volumeId}`
          );
          if (volumeResponse.ok) {
            const volumeData = await volumeResponse.json();
            const imgs = volumeData.volumeInfo?.imageLinks;
            if (imgs) {
              photoUrl = imgs.extraLarge || imgs.large || imgs.medium || imgs.small || imgs.thumbnail || imgs.smallThumbnail;
            }
          }
        } catch (e) {
          console.warn('Volume detail fetch failed, using search result thumbnail:', e);
        }

        // Fallback to search result thumbnails
        if (!photoUrl) {
          photoUrl = volumeInfo.imageLinks?.thumbnail || volumeInfo.imageLinks?.smallThumbnail || undefined;
        }

        // Enhance thumbnail URL for better quality
        if (photoUrl) {
          photoUrl = photoUrl.replace('zoom=1', 'zoom=0');
          photoUrl = photoUrl.replace('&edge=curl', '');
          if (photoUrl.startsWith('http://')) {
            photoUrl = photoUrl.replace('http://', 'https://');
          }
        }

        // If still no cover, try Open Library direct cover URL
        if (!photoUrl) {
          const olCoverUrl = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg?default=false`;
          try {
            const olCheck = await fetch(olCoverUrl, { method: 'HEAD' });
            if (olCheck.ok) {
              photoUrl = olCoverUrl;
            }
          } catch (e) {
            console.warn('Open Library cover check failed:', e);
          }
        }

        const categoryId = await resolveCategoryId(volumeInfo.categories);

        return {
          title,
          author,
          photoUrl,
          isbn: cleanIsbn,
          pageCount,
          categoryId
        };
      }
    }
  } catch (error) {
    console.warn('Google Books API error:', error);
  }

  try {
    // 2. Try Open Library API as a fallback
    const openLibraryResponse = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`
    );
    if (openLibraryResponse.ok) {
      const data = await openLibraryResponse.json();
      const bookKey = `ISBN:${cleanIsbn}`;
      if (data[bookKey]) {
        const bookData = data[bookKey];
        const title = bookData.title || '';
        const author = bookData.authors ? bookData.authors.map((a: any) => a.name).join(', ') : '';
        const pageCount = bookData.number_of_pages || 0;
        const photoUrl = bookData.cover?.large || bookData.cover?.medium || bookData.cover?.small || undefined;

        // Open Library doesn't have structured category strings, default to 'Diğer' or check subjects
        const subjects = bookData.subjects ? bookData.subjects.map((s: any) => s.name) : [];
        const categoryId = await resolveCategoryId(subjects);

        return {
          title,
          author,
          photoUrl,
          isbn: cleanIsbn,
          pageCount,
          categoryId
        };
      }
    }
  } catch (error) {
    console.warn('Open Library API error:', error);
  }

  return null;
}

// Download external cover image and save it locally
export async function downloadAndSaveCoverImage(url: string): Promise<string | null> {
  try {
    const extension = url.split('.').pop()?.split('?')[0] || 'jpg';
    const tempPath = `${FileSystem.cacheDirectory}temp_download_${Date.now()}.${extension}`;
    
    const downloadResult = await FileSystem.downloadAsync(url, tempPath);
    if (downloadResult.status !== 200) {
      return null;
    }
    
    return await saveBookCover(downloadResult.uri);
  } catch (error) {
    console.error('Error downloading book cover image:', error);
    return null;
  }
}
