import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StatusBar,
  Modal,
  Dimensions,
  ScrollView,
  Platform
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getAllBooks,
  searchBooks,
  deleteBook,
  getFilteredBooks,
  updateBookReadingStatus,
  updateBookFavoriteStatus,
  updateBook,
  getAllCategories,
  Book,
  Category,
  getSetting,
  BookQuote,
  addBookQuote,
  deleteBookQuote,
  getBookQuotes
} from '@/services/db';
import { deleteBookCover, saveBookCover } from '@/services/fs';
import BookCoverPlaceholder from '@/components/BookCoverPlaceholder';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { usePreferences } from '@/context/PreferencesContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type FilterType = 'all' | 'unread' | 'reading' | 'read' | 'favorites';

const getRingStyle = (percent: number, colorScheme: string) => {
  const borderColors: any = {
    borderColor: colorScheme === 'dark' ? '#2C2C2E' : '#E5E5EA',
    borderTopColor: '#0A84FF',
  };
  if (percent >= 25) borderColors.borderRightColor = '#0A84FF';
  if (percent >= 50) borderColors.borderBottomColor = '#0A84FF';
  if (percent >= 75) borderColors.borderLeftColor = '#0A84FF';
  return borderColors;
};

export default function HomeScreen() {
  const { colors, colorScheme, t, language } = usePreferences();
  const router = useRouter();
  const tabBarHeight = 58;

  // Timer cleanup refs
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    return () => {
      timerRefs.current.forEach(clearTimeout);
    };
  }, []);

  // Data states
  const [books, setBooks] = useState<Book[]>([]);

  // Calculate reading stats for progress widget
  const totalBooksCount = books.length;
  const readBooksCount = useMemo(() => books.filter(b => b.status === 'read').length, [books]);
  const readingBooksCount = useMemo(() => books.filter(b => b.status === 'reading').length, [books]);
  const progressRatio = useMemo(() => {
    if (totalBooksCount === 0) return 0;
    return Math.round((readBooksCount / totalBooksCount) * 100);
  }, [totalBooksCount, readBooksCount]);

  const [yearlyGoal, setYearlyGoal] = useState<number>(12);
  const goalProgressRatio = useMemo(() => {
    if (yearlyGoal <= 0) return 0;
    const ratio = Math.round((readBooksCount / yearlyGoal) * 100);
    return Math.min(ratio, 100);
  }, [readBooksCount, yearlyGoal]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  
  // Quotes & Notes states
  const [quotes, setQuotes] = useState<BookQuote[]>([]);
  const [newQuoteText, setNewQuoteText] = useState('');
  const [newQuotePage, setNewQuotePage] = useState('');
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [activeDetailTab, setActiveDetailTab] = useState<'details' | 'quotes'>('details');
  const [quotesLoading, setQuotesLoading] = useState(false);
  
  // Status states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal states
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);

  const closeDetailModal = useCallback(() => {
    setDetailModalVisible(false);
    const id = setTimeout(() => {
      setSelectedBook(null);
      setQuotes([]);
      setNewQuoteText('');
      setNewQuotePage('');
      setSelectedColorIndex(0);
      setActiveDetailTab('details');
    }, 400);
    timerRefs.current.push(id);
  }, []);

  const loadQuotes = async (bookId: number) => {
    try {
      setQuotesLoading(true);
      const data = await getBookQuotes(bookId);
      setQuotes(data);
    } catch (err) {
      console.error('Error loading quotes:', err);
    } finally {
      setQuotesLoading(false);
    }
  };

  const handleAddQuote = async () => {
    if (!newQuoteText.trim() || !selectedBook) return;
    try {
      const pageNum = newQuotePage ? parseInt(newQuotePage, 10) : null;
      await addBookQuote(selectedBook.id, newQuoteText, pageNum, selectedColorIndex);
      setNewQuoteText('');
      setNewQuotePage('');
      setSelectedColorIndex(0);
      await loadQuotes(selectedBook.id);
    } catch (err) {
      console.error('Error adding quote:', err);
      Alert.alert(t('error'), 'Alıntı eklenirken hata oluştu.');
    }
  };

  const handleDeleteQuote = async (quoteId: number) => {
    Alert.alert(
      t('quotes_delete_confirm'),
      '',
      [
        { text: t('cancel'), style: 'cancel' },
        { 
          text: t('delete'), 
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBookQuote(quoteId);
              if (selectedBook) {
                await loadQuotes(selectedBook.id);
              }
            } catch (err) {
              console.error('Error deleting quote:', err);
            }
          }
        }
      ]
    );
  };

  // Edit form states
  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editIsbn, setEditIsbn] = useState('');
  const [editPages, setEditPages] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<number | null>(null);
  const [editPhotoUri, setEditPhotoUri] = useState<string | null>(null);
  const [categorySelectorVisible, setCategorySelectorVisible] = useState(false);

  // Fetch books based on search and filters
  const loadBooks = useCallback(async () => {
    try {
      setLoading(true);
      let data: Book[] = [];

      if (searchQuery.trim() !== '') {
        data = await searchBooks(searchQuery);
        // Apply filter locally if search is active
        if (activeFilter === 'favorites') {
          data = data.filter(b => b.favorite === 1);
        } else if (activeFilter !== 'all') {
          data = data.filter(b => b.status === activeFilter);
        }
      } else {
        // Query database with filters
        if (activeFilter === 'favorites') {
          data = await getFilteredBooks({ favorite: true });
        } else if (activeFilter !== 'all') {
          data = await getFilteredBooks({ status: activeFilter });
        } else {
          data = await getAllBooks();
        }
      }
      setBooks(data);
    } catch (error) {
      console.error('Error loading books:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, activeFilter]);

  // Fetch categories (for the edit picker)
  const loadCategories = async () => {
    try {
      const data = await getAllCategories();
      setCategories(data);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadYearlyGoal = async () => {
    try {
      const goalStr = await getSetting('yearly_goal_2026', '12');
      setYearlyGoal(parseInt(goalStr, 10) || 12);
    } catch (err) {
      console.error('Error loading yearly goal:', err);
    }
  };

  // Reload data when screen gains focus
  useFocusEffect(
    useCallback(() => {
      loadBooks();
      loadCategories();
      loadYearlyGoal();
    }, [])
  );

  // Debounced search: wait 300ms after user stops typing before querying
  const isFirstRender = React.useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const debounceTimer = setTimeout(() => {
      loadBooks();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, activeFilter]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadBooks();
  }, [loadBooks]);

  // Delete Book
  const handleDeleteBook = (book: Book) => {
    Alert.alert(
      t('delete_book_title'),
      t('delete_book_confirm', { title: book.title }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (book.photo_path) {
                await deleteBookCover(book.photo_path);
              }
              await deleteBook(book.id);
              setDetailModalVisible(false);
              setSelectedBook(null);
              loadBooks();
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert(t('error'), t('delete_book_error'));
            }
          },
        },
      ]
    );
  };

  // Toggle Favorite
  const handleToggleFavorite = async (book: Book) => {
    try {
      const newFavStatus = book.favorite === 1 ? false : true;
      await updateBookFavoriteStatus(book.id, newFavStatus);
      
      const updatedBook = { ...book, favorite: newFavStatus ? 1 : 0 };
      setSelectedBook(updatedBook);
      
      // Update books list in background
      setBooks(prev => prev.map(b => b.id === book.id ? updatedBook : b));
    } catch (error) {
      console.error('Favorite update error:', error);
    }
  };

  // Update Reading Status
  const handleUpdateStatus = async (book: Book, newStatus: 'read' | 'reading' | 'unread') => {
    try {
      await updateBookReadingStatus(book.id, newStatus);
      
      const updatedBook = { ...book, status: newStatus };
      setSelectedBook(updatedBook);
      
      // Update books list in background
      setBooks(prev => prev.map(b => b.id === book.id ? updatedBook : b));
    } catch (error) {
      console.error('Status update error:', error);
    }
  };

  // Open Edit Modal
  const openEditModal = (book: Book) => {
    setEditTitle(book.title);
    setEditAuthor(book.author || '');
    setEditIsbn(book.isbn || '');
    setEditPages(book.page_count > 0 ? book.page_count.toString() : '');
    setEditCategoryId(book.category_id);
    setEditPhotoUri(book.photo_path || null);
    
    // Close details modal first to avoid nested modals on iOS
    setDetailModalVisible(false);
    
    const id = setTimeout(() => {
      setEditModalVisible(true);
    }, 400);
    timerRefs.current.push(id);
  };

  // Handle image pick/take for editing
  const handleEditPhotoPress = () => {
    Alert.alert(
      t('edit_cover_change'),
      t('edit_cover_select_source'),
      [
        {
          text: t('edit_cover_take_photo'),
          onPress: () => {
            setTimeout(async () => {
              try {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                  Alert.alert(t('warning'), t('scanner_permission_req'));
                  return;
                }
                const result = await ImagePicker.launchCameraAsync({
                  allowsEditing: true,
                  aspect: [3, 4],
                  quality: 0.6,
                  mediaTypes: ['images'],
                  ...(Platform.OS === 'android' && { presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN })
                });
                if (!result.canceled && result.assets && result.assets.length > 0) {
                  setEditPhotoUri(result.assets[0].uri);
                }
              } catch (error) {
                console.error('Error launching camera:', error);
                Alert.alert(t('error'), 'Kamera açılırken bir hata oluştu.');
              }
            }, 200);
          }
        },
        {
          text: t('edit_cover_choose_gallery'),
          onPress: () => {
            setTimeout(async () => {
              try {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') {
                  Alert.alert(t('warning'), t('scanner_permission_req'));
                  return;
                }
                const result = await ImagePicker.launchImageLibraryAsync({
                  allowsEditing: true,
                  aspect: [3, 4],
                  quality: 0.6,
                  mediaTypes: ['images'],
                  ...(Platform.OS === 'android' && { presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN })
                });
                if (!result.canceled && result.assets && result.assets.length > 0) {
                  setEditPhotoUri(result.assets[0].uri);
                }
              } catch (error) {
                console.error('Error launching gallery:', error);
                Alert.alert(t('error'), 'Galeri açılırken bir hata oluştu.');
              }
            }, 200);
          }
        },
        { text: t('edit_cover_remove'), style: 'destructive', onPress: () => setEditPhotoUri(null) },
        { text: t('cancel'), style: 'cancel' }
      ]
    );
  };

  // Save Book Edits
  const handleSaveEdits = async () => {
    if (!selectedBook) return;
    if (!editTitle.trim()) {
      Alert.alert(t('warning'), t('edit_missing_title'));
      return;
    }

    try {
      let finalPhotoPath: string | null = editPhotoUri;

      // Handle photo changes/savings
      if (editPhotoUri && editPhotoUri !== selectedBook.photo_path) {
        // Delete old cover first if existed
        if (selectedBook.photo_path) {
          await deleteBookCover(selectedBook.photo_path);
        }
        // Save new cover persistently
        finalPhotoPath = await saveBookCover(editPhotoUri);
      } else if (!editPhotoUri && selectedBook.photo_path) {
        // Photo removed
        await deleteBookCover(selectedBook.photo_path);
        finalPhotoPath = null;
      }

      const pagesNum = editPages.trim() ? parseInt(editPages.trim(), 10) : 0;

      await updateBook(
        selectedBook.id,
        editTitle.trim(),
        editAuthor.trim(),
        editIsbn.trim(),
        pagesNum,
        editCategoryId,
        finalPhotoPath
      );

      // Re-fetch updated book details
      const categoryName = categories.find(c => c.id === editCategoryId)?.name || t('no_category');
      const updatedBook: Book = {
        ...selectedBook,
        title: editTitle.trim(),
        author: editAuthor.trim(),
        isbn: editIsbn.trim(),
        page_count: pagesNum,
        category_id: editCategoryId,
        photo_path: finalPhotoPath || '',
        category_name: categoryName
      };

      setSelectedBook(updatedBook);
      setEditModalVisible(false);
      
      // Open details modal back
      const id = setTimeout(() => {
        setDetailModalVisible(true);
      }, 400);
      timerRefs.current.push(id);
      
      loadBooks();
      Alert.alert(t('success'), t('edit_success'));
    } catch (error) {
      console.error('Update error:', error);
      Alert.alert(t('error'), t('edit_save_error'));
    }
  };

  const getStatusText = useCallback((status: 'read' | 'reading' | 'unread') => {
    if (status === 'read') return t('filter_read');
    if (status === 'reading') return t('filter_reading');
    return t('filter_unread');
  }, [t]);

  const formatRecordDate = useCallback((dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(language === 'tr' ? 'tr-TR' : language === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateString;
    }
  }, [language]);

  const renderBookItem = useCallback(({ item }: { item: Book }) => {
    return (
      <TouchableOpacity
        style={[styles.bookCard, { backgroundColor: colors.backgroundElement }]}
        onPress={() => {
          setSelectedBook(item);
          loadQuotes(item.id);
          setActiveDetailTab('details');
          setDetailModalVisible(true);
        }}
        activeOpacity={0.7}
      >
        {/* Book Cover Image with Floating Shadow Container */}
        <View style={styles.coverShadowContainer}>
          {item.photo_path ? (
            <Image source={{ uri: item.photo_path }} style={styles.coverImage} />
          ) : (
            <BookCoverPlaceholder title={item.title} author={item.author} width={44} height={60} borderRadius={6} />
          )}
        </View>

        {/* Book Info */}
        <View style={styles.bookInfo}>
          <View style={styles.titleRow}>
            <Text style={[styles.bookTitle, { color: colors.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            {item.favorite === 1 ? (
              <Ionicons name="star" size={15} color="#FFD60A" style={{ marginLeft: 6 }} />
            ) : null}
          </View>
          <Text style={[styles.bookAuthor, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.author || t('unknown_author')}
          </Text>
          
          <View style={styles.badgeRow}>
            {/* Status Badge */}
            <Text style={[
              styles.statusBadge,
              item.status === 'read' ? styles.statusRead : item.status === 'reading' ? styles.statusReading : styles.statusUnread
            ]}>
              {getStatusText(item.status)}
            </Text>
            
            {/* Category Badge */}
            {item.category_name ? (
              <Text style={[styles.categoryBadge, { backgroundColor: colorScheme === 'dark' ? '#2E2F33' : '#E5E5EA', color: colors.textSecondary }]}>
                {item.category_name}
              </Text>
            ) : null}

            {/* Page Count */}
            {item.page_count > 0 ? (
              <Text style={styles.pagesText}>{item.page_count} {language === 'tr' ? 'sf' : language === 'ar' ? 'ص' : 'p'}</Text>
            ) : null}
          </View>
        </View>

        <Ionicons name="chevron-forward" size={18} color="#8E8E93" style={styles.chevron} />
      </TouchableOpacity>
    );
  }, [colors, colorScheme, t, language]);

  const keyExtractor = useCallback((item: Book) => item.id.toString(), []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Header Info */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>{t('tab_library')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('books_listed', { count: books.length })}
          </Text>
        </View>
      </View>

      {/* Reading Progress Widget */}
      {totalBooksCount > 0 && (
        <View style={[styles.progressCard, { backgroundColor: colors.backgroundElement }]}>
          <View style={styles.progressLayoutRow}>
            {/* Left side: stats & linear progress */}
            <View style={styles.progressLeftSection}>
              <View style={styles.progressTitleRow}>
                <Ionicons name="trophy-outline" size={16} color="#FFD60A" style={{ marginRight: 6 }} />
                <Text style={[styles.progressTitle, { color: colors.text }]}>
                  {language === 'tr' ? 'Okuma Yolculuğun' : language === 'ar' ? 'رحلة قراءتك' : 'Reading Journey'}
                </Text>
              </View>
              
              <Text style={[styles.progressSubtext, { color: colors.textSecondary, marginTop: 4 }]}>
                {language === 'tr' 
                  ? `${totalBooksCount} kitaptan ${readBooksCount} tanesini okudun.` 
                  : language === 'ar'
                  ? `لقد قرأت ${readBooksCount} من أصل ${totalBooksCount} كتب.`
                  : `You've read ${readBooksCount} out of ${totalBooksCount} books.`
                }
              </Text>

              {/* Progress Bar Track */}
              <View style={[styles.progressBarTrack, { backgroundColor: colorScheme === 'dark' ? '#2C2C2E' : '#E5E5EA', marginTop: 10 }]}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { 
                      width: `${progressRatio}%`,
                      backgroundColor: '#0A84FF',
                    }
                  ]} 
                />
              </View>
              <Text style={[styles.progressPercentText, { color: '#0A84FF', fontSize: 11, marginTop: 4, fontWeight: '600' }]}>
                {language === 'tr' ? `Genel Okuma Oranı: %${progressRatio}` : language === 'ar' ? `معدل القراءة العام: ${progressRatio}%` : `Library read ratio: ${progressRatio}%`}
              </Text>
            </View>

            {/* Right side: Yearly Goal Progress Ring */}
            <View style={styles.progressRightSection}>
              <View style={[styles.progressRingOuter, getRingStyle(goalProgressRatio, colorScheme)]}>
                <View style={[styles.progressRingInner, { backgroundColor: colors.backgroundElement }]}>
                  <Text style={[styles.progressRingText, { color: colors.text }]}>{goalProgressRatio}%</Text>
                </View>
              </View>
              <Text style={[styles.progressRingLabel, { color: colors.text }]} numberOfLines={1}>
                {t('yearly_goal_title')}
              </Text>
              <Text style={[styles.progressRingSubtext, { color: colors.textSecondary }]}>
                {readBooksCount} / {yearlyGoal}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Search Input */}
      <View style={[styles.searchContainer, { backgroundColor: colors.backgroundElement }]}>
        <Ionicons name="search-outline" size={20} color="#8E8E93" style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={t('search_placeholder')}
          placeholderTextColor="#8E8E93"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#8E8E93" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter Row */}
      <View style={styles.filterOuterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          {[
            { type: 'all', label: t('filter_all') },
            { type: 'unread', label: t('filter_unread') },
            { type: 'reading', label: t('filter_reading') },
            { type: 'read', label: t('filter_read') },
            { type: 'favorites', label: t('filter_favorites') },
          ].map((filter) => {
            const isActive = activeFilter === filter.type;
            return (
              <TouchableOpacity
                key={filter.type}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isActive ? '#0A84FF' : colors.backgroundElement,
                  },
                ]}
                onPress={() => setActiveFilter(filter.type as FilterType)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: isActive ? '#FFF' : colors.textSecondary,
                      fontWeight: isActive ? 'bold' : 'normal',
                    },
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Book List */}
      {loading && books.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0A84FF" />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('loading')}</Text>
        </View>
      ) : books.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons
            name={searchQuery ? 'search-outline' : 'book-outline'}
            size={72}
            color={colorScheme === 'dark' ? '#2E2F33' : '#E5E5EA'}
          />
          <Text style={[styles.emptyText, { color: colors.text }]}>
            {searchQuery ? t('search_empty') : t('books_empty')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={books}
          renderItem={renderBookItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={8}
          updateCellsBatchingPeriod={50}
        />
      )}

      {/* Floating Action Button (FAB) to Add Book */}
      <TouchableOpacity
        style={[styles.fab, { bottom: tabBarHeight + 16 }]}
        onPress={() => router.push('/add')}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>

      {/* Book Details Modal */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeDetailModal}
      >
        {selectedBook && (
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Header Controls */}
                <View style={styles.modalHeaderRow}>
                  <TouchableOpacity
                    style={styles.modalHeaderBtn}
                    onPress={() => handleToggleFavorite(selectedBook)}
                  >
                    <Ionicons
                      name={selectedBook.favorite === 1 ? 'star' : 'star-outline'}
                      size={24}
                      color={selectedBook.favorite === 1 ? '#FFD60A' : colors.text}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalHeaderBtn}
                    onPress={() => openEditModal(selectedBook)}
                  >
                    <Ionicons name="create-outline" size={24} color={colors.text} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalHeaderBtn, { marginLeft: 'auto' }]}
                    onPress={closeDetailModal}
                  >
                    <Ionicons name="close" size={26} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Modal Tabs */}
                <View style={[styles.modalTabContainer, { borderBottomColor: colorScheme === 'dark' ? '#2C2C2E' : '#E5E5EA' }]}>
                  <TouchableOpacity
                    style={[styles.modalTabButton, activeDetailTab === 'details' && styles.modalTabButtonActive]}
                    onPress={() => setActiveDetailTab('details')}
                  >
                    <Text style={[styles.modalTabButtonText, { color: activeDetailTab === 'details' ? '#0A84FF' : colors.textSecondary }]}>
                      {t('details_label') || 'Detaylar'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalTabButton, activeDetailTab === 'quotes' && styles.modalTabButtonActive]}
                    onPress={() => setActiveDetailTab('quotes')}
                  >
                    <Text style={[styles.modalTabButtonText, { color: activeDetailTab === 'quotes' ? '#0A84FF' : colors.textSecondary }]}>
                      {t('quotes_title') || 'Alıntılar'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {activeDetailTab === 'details' ? (
                  <>
                    {/* Big Cover Image */}
                    <View style={styles.modalCoverSection}>
                      {selectedBook.photo_path ? (
                        <Image source={{ uri: selectedBook.photo_path }} style={styles.modalCoverImage} />
                      ) : (
                        <BookCoverPlaceholder 
                          title={selectedBook.title} 
                          author={selectedBook.author} 
                          width={SCREEN_WIDTH * 0.4} 
                          height={SCREEN_WIDTH * 0.53} 
                          borderRadius={14} 
                        />
                      )}
                    </View>

                    {/* Book Details */}
                    <View style={styles.modalDetails}>
                      <Text style={[styles.modalTitleText, { color: colors.text }]}>{selectedBook.title}</Text>
                      <Text style={[styles.modalAuthorText, { color: colors.textSecondary }]}>
                        {selectedBook.author || t('unknown_author')}
                      </Text>
                      
                      <View style={[styles.modalSeparator, { backgroundColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]} />

                      {/* Reading Status Selector Selector */}
                      <Text style={[styles.detailSectionLabel, { color: colors.textSecondary }]}>{t('status_label')}</Text>
                      <View style={styles.statusSelectorsContainer}>
                        {[
                          { status: 'unread', label: t('filter_unread') },
                          { status: 'reading', label: t('filter_reading') },
                          { status: 'read', label: t('filter_read') },
                        ].map((item) => {
                          const isSelected = selectedBook.status === item.status;
                          return (
                            <TouchableOpacity
                              key={item.status}
                              style={[
                                styles.statusSelectChip,
                                {
                                  backgroundColor: isSelected ? '#0A84FF' : colors.backgroundElement,
                                  borderColor: isSelected ? '#0A84FF' : 'transparent',
                                },
                              ]}
                              onPress={() => handleUpdateStatus(selectedBook, item.status as any)}
                            >
                              <Text style={[styles.statusSelectChipText, { color: isSelected ? '#FFF' : colors.text }]}>
                                {item.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Metadata fields */}
                      <Text style={[styles.detailSectionLabel, { color: colors.textSecondary, marginTop: 12 }]}>{t('details_label')}</Text>

                      {/* Category */}
                      <View style={styles.detailRow}>
                        <Ionicons name="grid-outline" size={18} color="#8E8E93" />
                        <View style={styles.detailTextContainer}>
                          <Text style={styles.detailLabel}>{t('category_label')}</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {selectedBook.category_name || t('no_category')}
                          </Text>
                        </View>
                      </View>

                      {/* Page Count */}
                      <View style={styles.detailRow}>
                        <Ionicons name="document-text-outline" size={18} color="#8E8E93" />
                        <View style={styles.detailTextContainer}>
                          <Text style={styles.detailLabel}>{t('pages_label')}</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {selectedBook.page_count > 0 ? t('pages_count', { count: selectedBook.page_count }) : t('unspecified')}
                          </Text>
                        </View>
                      </View>

                      {/* ISBN */}
                      {selectedBook.isbn ? (
                        <View style={styles.detailRow}>
                          <Ionicons name="barcode-outline" size={18} color="#8E8E93" />
                          <View style={styles.detailTextContainer}>
                            <Text style={styles.detailLabel}>{t('isbn_label')}</Text>
                            <Text style={[styles.detailValue, { color: colors.text }]}>{selectedBook.isbn}</Text>
                          </View>
                        </View>
                      ) : null}

                      {/* Record Date */}
                      <View style={styles.detailRow}>
                        <Ionicons name="calendar-outline" size={18} color="#8E8E93" />
                        <View style={styles.detailTextContainer}>
                          <Text style={styles.detailLabel}>{t('added_date_label')}</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {formatRecordDate(selectedBook.created_at)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Footer lending link button */}
                    <TouchableOpacity
                      style={[styles.modalLendBtn, { backgroundColor: colors.backgroundElement }]}
                      onPress={() => {
                        closeDetailModal();
                        router.push('/lending');
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="people-outline" size={18} color="#0A84FF" />
                      <Text style={[styles.modalLendBtnText, { color: colors.text }]}>{t('lend_book_btn')}</Text>
                    </TouchableOpacity>

                    {/* Delete Book Action */}
                    <TouchableOpacity
                      style={styles.modalDeleteBtn}
                      onPress={() => handleDeleteBook(selectedBook)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={18} color="#FFF" />
                      <Text style={styles.modalDeleteBtnText}>{t('delete_book_btn')}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={styles.quotesSection}>
                    {/* Add Quote Form */}
                    <View style={[styles.addQuoteContainer, { backgroundColor: colors.backgroundElement }]}>
                      <TextInput
                        style={[styles.quoteInput, { color: colors.text, borderColor: colorScheme === 'dark' ? '#2C2C2E' : '#E5E5EA' }]}
                        placeholder={t('quotes_input_placeholder')}
                        placeholderTextColor="#8E8E93"
                        multiline
                        numberOfLines={3}
                        value={newQuoteText}
                        onChangeText={setNewQuoteText}
                      />
                      
                      <View style={styles.quoteFormRow}>
                        <View style={styles.quotePageInputContainer}>
                          <Text style={[styles.quoteFormLabel, { color: colors.textSecondary }]}>{t('quotes_page_label')}</Text>
                          <TextInput
                            style={[styles.quotePageInput, { color: colors.text, borderColor: colorScheme === 'dark' ? '#2C2C2E' : '#E5E5EA' }]}
                            placeholder="123"
                            placeholderTextColor="#8E8E93"
                            keyboardType="numeric"
                            value={newQuotePage}
                            onChangeText={setNewQuotePage}
                          />
                        </View>
                        
                        <View style={styles.quoteColorsContainer}>
                          <Text style={[styles.quoteFormLabel, { color: colors.textSecondary }]}>{t('quotes_color_label')}</Text>
                          <View style={styles.colorsRow}>
                            {['#E0C3FC', '#FFECD2', '#84FAB0', '#A1C4FD', '#FAD0C4'].map((color, index) => (
                              <TouchableOpacity
                                key={index}
                                style={[
                                  styles.colorCircle,
                                  { backgroundColor: color },
                                ]}
                                onPress={() => setSelectedColorIndex(index)}
                              >
                                {selectedColorIndex === index && (
                                  <Ionicons name="checkmark" size={14} color="#3F3D56" />
                                )}
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[styles.addQuoteBtn, { backgroundColor: newQuoteText.trim() ? '#0A84FF' : '#8E8E93' }]}
                        onPress={handleAddQuote}
                        disabled={!newQuoteText.trim()}
                      >
                        <Text style={styles.addQuoteBtnText}>{t('quotes_add_btn')}</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Quotes List */}
                    {quotesLoading ? (
                      <ActivityIndicator size="small" color="#0A84FF" style={{ marginVertical: 24 }} />
                    ) : quotes.length === 0 ? (
                      <View style={styles.emptyQuotesContainer}>
                        <Ionicons name="create-outline" size={44} color="#8E8E93" style={{ opacity: 0.5 }} />
                        <Text style={[styles.emptyQuotesText, { color: colors.textSecondary }]}>
                          {t('quotes_empty')}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.quotesList}>
                        {quotes.map((quote) => {
                          const cardColors = ['#E0C3FC', '#FFECD2', '#84FAB0', '#A1C4FD', '#FAD0C4'];
                          const cardColor = cardColors[quote.color_index] || '#E0C3FC';
                          return (
                            <View key={quote.id} style={[styles.quoteCard, { backgroundColor: cardColor }]}>
                              <TouchableOpacity
                                style={styles.deleteQuoteBtn}
                                onPress={() => handleDeleteQuote(quote.id)}
                              >
                                <Ionicons name="close" size={16} color="#3F3D56" />
                              </TouchableOpacity>
                              <Text style={styles.quoteCardText}>“{quote.content}”</Text>
                              {quote.page && (
                                <Text style={styles.quoteCardPage}>
                                  {language === 'tr' ? `Sayfa ${quote.page}` : language === 'ar' ? `صفحة ${quote.page}` : `Page ${quote.page}`}
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>

      {/* Book Edit Modal Form */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (categorySelectorVisible) {
            setCategorySelectorVisible(false);
          } else {
            setEditModalVisible(false);
            const id2 = setTimeout(() => {
              setDetailModalVisible(true);
            }, 400);
            timerRefs.current.push(id2);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.editModalContent,
              categorySelectorVisible && { height: '60%' },
              { backgroundColor: colors.background }
            ]}
          >
            {categorySelectorVisible ? (
              <>
                <View style={styles.selectorHeader}>
                  <Text style={[styles.selectorTitle, { color: colors.text }]}>{t('add_book_cat_label')}</Text>
                  <TouchableOpacity onPress={() => setCategorySelectorVisible(false)}>
                    <Ionicons name="close" size={26} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <FlatList
                  data={categories}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.selectorListItem, { borderBottomColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]}
                      onPress={() => {
                        setEditCategoryId(item.id);
                        setCategorySelectorVisible(false);
                      }}
                    >
                      <Text style={[styles.selectorListItemTitle, { color: colors.text }]}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={[styles.editModalTitle, { color: colors.text }]}>{t('edit_title')}</Text>

                {/* Edit Cover Box */}
                <View style={styles.editPhotoSection}>
                  <TouchableOpacity
                    style={[
                      styles.editPhotoBox,
                      {
                        backgroundColor: colors.backgroundElement,
                        borderColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA',
                      },
                    ]}
                    onPress={handleEditPhotoPress}
                    activeOpacity={0.7}
                  >
                    {editPhotoUri ? (
                      <View style={styles.editImageWrapper}>
                        <Image source={{ uri: editPhotoUri }} style={styles.editCoverPreview} />
                        <View style={styles.editPhotoOverlay}>
                          <Ionicons name="camera" size={20} color="#FFF" />
                          <Text style={styles.editPhotoOverlayText}>{t('edit')}</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.editPhotoPlaceholder}>
                        <Ionicons name="camera-outline" size={32} color="#8E8E93" />
                        <Text style={[styles.editPhotoPlaceholderText, { color: colors.textSecondary }]}>
                          {t('edit_cover_add')}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Title Input */}
                <Text style={[styles.editLabel, { color: colors.text }]}>{t('edit_book_name')}</Text>
                <TextInput
                  style={[
                    styles.editInput,
                    {
                      backgroundColor: colors.backgroundElement,
                      color: colors.text,
                      borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6',
                    },
                  ]}
                  value={editTitle}
                  onChangeText={setEditTitle}
                />

                {/* Author Input */}
                <Text style={[styles.editLabel, { color: colors.text }]}>{t('edit_author')}</Text>
                <TextInput
                  style={[
                    styles.editInput,
                    {
                      backgroundColor: colors.backgroundElement,
                      color: colors.text,
                      borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6',
                    },
                  ]}
                  value={editAuthor}
                  onChangeText={setEditAuthor}
                />

                {/* Category Picker Trigger */}
                <Text style={[styles.editLabel, { color: colors.text }]}>{t('edit_category')}</Text>
                <TouchableOpacity
                  style={[
                    styles.editSelectorInput,
                    {
                      backgroundColor: colors.backgroundElement,
                      borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6',
                    },
                  ]}
                  onPress={() => setCategorySelectorVisible(true)}
                >
                  <Text style={{ color: colors.text, fontSize: 16 }}>
                    {categories.find(c => c.id === editCategoryId)?.name || t('no_category')}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#8E8E93" />
                </TouchableOpacity>

                {/* Page Count Input */}
                <Text style={[styles.editLabel, { color: colors.text }]}>{t('edit_pages')}</Text>
                <TextInput
                  style={[
                    styles.editInput,
                    {
                      backgroundColor: colors.backgroundElement,
                      color: colors.text,
                      borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6',
                    },
                  ]}
                  placeholder={t('edit_pages')}
                  placeholderTextColor="#8E8E93"
                  value={editPages}
                  onChangeText={setEditPages}
                  keyboardType="number-pad"
                />

                {/* ISBN Input */}
                <Text style={[styles.editLabel, { color: colors.text }]}>{t('edit_isbn')}</Text>
                <TextInput
                  style={[
                    styles.editInput,
                    {
                      backgroundColor: colors.backgroundElement,
                      color: colors.text,
                      borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6',
                    },
                  ]}
                  value={editIsbn}
                  onChangeText={setEditIsbn}
                  keyboardType="number-pad"
                />

                {/* Action Buttons */}
                <View style={[styles.modalBtnRow, { marginTop: 12 }]}>
                  <TouchableOpacity
                    style={[styles.btnCancel, { borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6' }]}
                    onPress={() => {
                      setEditModalVisible(false);
                      const id3 = setTimeout(() => {
                        setDetailModalVisible(true);
                      }, 400);
                      timerRefs.current.push(id3);
                    }}
                  >
                    <Text style={[styles.btnCancelText, { color: colors.text }]}>{t('cancel')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.btnConfirm} onPress={handleSaveEdits}>
                    <Text style={styles.btnConfirmText}>{t('save')}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 8,
  },
  filterOuterContainer: {
    marginBottom: 15,
  },
  filterContainer: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  filterChipText: {
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120, // extra padding for FAB + tab bar
  },
  bookCard: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  coverShadowContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 4.5,
    elevation: 3,
  },
  coverImage: {
    width: 44,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#E5E5EA',
  },

  bookInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bookTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  bookAuthor: {
    fontSize: 13,
    marginTop: 2,
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 5,
    overflow: 'hidden',
  },
  statusRead: {
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    color: '#34C759',
  },
  statusReading: {
    backgroundColor: 'rgba(10, 132, 255, 0.15)',
    color: '#0A84FF',
  },
  statusUnread: {
    backgroundColor: 'rgba(142, 142, 147, 0.15)',
    color: '#8E8E93',
  },
  categoryBadge: {
    fontSize: 10,
    fontWeight: '500',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 5,
    overflow: 'hidden',
  },
  pagesText: {
    fontSize: 11,
    color: '#8E8E93',
  },
  chevron: {
    marginLeft: 6,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#0A84FF',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0A84FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 99,
  },
  // Modal Overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 8,
  },
  modalHeaderBtn: {
    padding: 6,
  },
  modalCoverSection: {
    alignItems: 'center',
    marginVertical: 12,
  },
  modalCoverImage: {
    width: SCREEN_WIDTH * 0.4,
    height: SCREEN_WIDTH * 0.53,
    borderRadius: 14,
    backgroundColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  modalPlaceholderCover: {
    width: SCREEN_WIDTH * 0.4,
    height: SCREEN_WIDTH * 0.53,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  modalDetails: {
    alignItems: 'center',
    marginTop: 8,
  },
  modalTitleText: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 26,
  },
  modalAuthorText: {
    fontSize: 15,
    marginTop: 4,
    textAlign: 'center',
  },
  modalSeparator: {
    height: 1,
    width: '100%',
    marginVertical: 16,
  },
  detailSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  statusSelectorsContainer: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  statusSelectChip: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  statusSelectChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
    gap: 12,
  },
  detailTextContainer: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: '#8E8E93',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 1,
  },
  modalLendBtn: {
    flexDirection: 'row',
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 15,
    gap: 6,
  },
  modalLendBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalDeleteBtn: {
    backgroundColor: '#FF453A',
    flexDirection: 'row',
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
    gap: 6,
  },
  modalDeleteBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  // Edit Modal Content Styles
  editModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    height: '90%',
    marginTop: 'auto',
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  editPhotoSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  editPhotoBox: {
    width: 90,
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  editImageWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  editCoverPreview: {
    width: '100%',
    height: '100%',
  },
  editPhotoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 2,
  },
  editPhotoOverlayText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '500',
  },
  editPhotoPlaceholder: {
    alignItems: 'center',
    padding: 5,
  },
  editPhotoPlaceholderText: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  editLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 6,
  },
  editInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    marginBottom: 10,
  },
  editSelectorInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnCancel: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  btnConfirm: {
    flex: 2,
    height: 44,
    backgroundColor: '#34C759',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnConfirmText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  // Category Selector modal
  categorySelectorModalContent: {
    width: '100%',
    height: '60%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    marginTop: 'auto',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  selectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  selectorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  selectorListItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  selectorListItemTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  selectorListItemAuthor: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  progressCard: {
    marginHorizontal: 20,
    marginTop: 2,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  progressPercentText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    width: '100%',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressSubtext: {
    fontSize: 11,
    lineHeight: 15,
  },
  progressLayoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLeftSection: {
    flex: 1.3,
    marginRight: 12,
  },
  progressRightSection: {
    flex: 0.7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRingOuter: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressRingInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressRingText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  progressRingLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 4,
    textAlign: 'center',
  },
  progressRingSubtext: {
    fontSize: 9,
    marginTop: 1,
  },
  
  // Modal Tab Styles
  modalTabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  modalTabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalTabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#0A84FF',
  },
  modalTabButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  
  // Quotes Styles
  quotesSection: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  addQuoteContainer: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  quoteInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  quoteFormRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  quotePageInputContainer: {
    flex: 1,
  },
  quoteFormLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  quotePageInput: {
    borderWidth: 1,
    borderRadius: 10,
    height: 38,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  quoteColorsContainer: {
    flex: 2,
  },
  colorsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  colorCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },

  addQuoteBtn: {
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addQuoteBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyQuotesContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyQuotesText: {
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  quotesList: {
    gap: 12,
  },
  quoteCard: {
    borderRadius: 14,
    padding: 16,
    position: 'relative',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  deleteQuoteBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  quoteCardText: {
    fontSize: 14,
    color: '#3F3D56',
    fontWeight: '500',
    lineHeight: 20,
    paddingRight: 24,
  },
  quoteCardPage: {
    fontSize: 10,
    color: '#3F3D56',
    fontWeight: '600',
    marginTop: 8,
    opacity: 0.7,
  },
});
