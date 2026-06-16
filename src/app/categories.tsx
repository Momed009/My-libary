import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ScrollView,
  Image
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getAllCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getFilteredBooks,
  associateBookToCategory,
  getAllBooks,
  Category,
  Book
} from '@/services/db';
import { Ionicons } from '@expo/vector-icons';
import { usePreferences } from '@/context/PreferencesContext';

const ICON_OPTIONS = [
  'book', 'time', 'bulb', 'create', 'sunny', 'flask', 'trending-up', 'people',
  'color-palette', 'cash', 'happy', 'school', 'ribbon', 'person', 'globe',
  'heart', 'star', 'trophy', 'musical-notes', 'film', 'journal', 'compass',
  'calculator', 'flame', 'leaf', 'shield', 'wifi', 'airplane', 'chatbubble'
];

const getCategoryColor = (name: string, isDark: boolean) => {
  const lower = name.toLowerCase().trim();
  
  if (lower.includes('roman') || lower.includes('novel') || lower.includes('edebiyat') || lower.includes('literature')) {
    return { bg: isDark ? 'rgba(255, 69, 58, 0.15)' : 'rgba(255, 59, 48, 0.1)' , color: '#FF453A' };
  }
  if (lower.includes('tarih') || lower.includes('history')) {
    return { bg: isDark ? 'rgba(255, 159, 10, 0.15)' : 'rgba(255, 149, 0, 0.1)' , color: '#FF9F0A' };
  }
  if (lower.includes('felsefe') || lower.includes('philosophy')) {
    return { bg: isDark ? 'rgba(48, 209, 88, 0.15)' : 'rgba(52, 199, 89, 0.1)' , color: '#30D158' };
  }
  if (lower.includes('şiir') || lower.includes('poetry')) {
    return { bg: isDark ? 'rgba(255, 55, 95, 0.15)' : 'rgba(255, 45, 85, 0.1)' , color: '#FF375F' };
  }
  if (lower.includes('din') || lower.includes('religion')) {
    return { bg: isDark ? 'rgba(191, 90, 242, 0.15)' : 'rgba(175, 82, 222, 0.1)' , color: '#BF5AF2' };
  }
  if (lower.includes('bilim') || lower.includes('science') || lower.includes('fizik') || lower.includes('kimya')) {
    return { bg: isDark ? 'rgba(100, 210, 255, 0.15)' : 'rgba(90, 200, 250, 0.1)' , color: '#64D2FF' };
  }
  if (lower.includes('kişisel') || lower.includes('self')) {
    return { bg: isDark ? 'rgba(255, 214, 10, 0.15)' : 'rgba(255, 204, 0, 0.12)' , color: '#FFD60A' };
  }
  if (lower.includes('psikoloji') || lower.includes('psychology')) {
    return { bg: isDark ? 'rgba(0, 199, 190, 0.15)' : 'rgba(0, 199, 190, 0.1)' , color: '#00D6CD' };
  }
  if (lower.includes('sanat') || lower.includes('art')) {
    return { bg: isDark ? 'rgba(255, 105, 180, 0.15)' : 'rgba(255, 105, 180, 0.1)' , color: '#FF69B4' };
  }
  if (lower.includes('iş') || lower.includes('ekonomi') || lower.includes('business') || lower.includes('finance')) {
    return { bg: isDark ? 'rgba(52, 199, 89, 0.18)' : 'rgba(48, 176, 199, 0.1)' , color: '#30B0C7' };
  }
  if (lower.includes('çocuk') || lower.includes('children')) {
    return { bg: isDark ? 'rgba(255, 55, 95, 0.15)' : 'rgba(255, 45, 85, 0.1)' , color: '#FF375F' };
  }
  if (lower.includes('eğitim') || lower.includes('education')) {
    return { bg: isDark ? 'rgba(94, 92, 230, 0.15)' : 'rgba(88, 86, 214, 0.1)' , color: '#5E5CE6' };
  }
  if (lower.includes('siyaset') || lower.includes('politics')) {
    return { bg: isDark ? 'rgba(142, 142, 147, 0.18)' : 'rgba(142, 142, 147, 0.12)' , color: '#8E8E93' };
  }
  if (lower.includes('biyografi') || lower.includes('biography')) {
    return { bg: isDark ? 'rgba(10, 132, 255, 0.15)' : 'rgba(0, 122, 255, 0.1)' , color: '#0A84FF' };
  }
  
  return { bg: isDark ? 'rgba(10, 132, 255, 0.15)' : 'rgba(0, 122, 255, 0.1)' , color: '#0A84FF' };
};

export default function CategoriesScreen() {
  const { colors, colorScheme, t, language } = usePreferences();
  const router = useRouter();

  // Data states
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categoryBooks, setCategoryBooks] = useState<Book[]>([]);
  const [allBooksList, setAllBooksList] = useState<Book[]>([]);

  // Modal visibility states
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('book');

  const [categoryDetailVisible, setCategoryDetailVisible] = useState(false);
  const [bookAssignModalVisible, setBookAssignModalVisible] = useState(false);
  const [expandedBookId, setExpandedBookId] = useState<number | null>(null);

  const getStatusText = useCallback((status: string) => {
    if (status === 'read') return t('filter_read');
    if (status === 'reading') return t('filter_reading');
    return t('filter_unread');
  }, [t]);

  const closeCategoryDetail = () => {
    setCategoryDetailVisible(false);
    setTimeout(() => {
      setSelectedCategory(null);
    }, 400);
  };

  const handleCloseAssignModal = () => {
    setBookAssignModalVisible(false);
    setTimeout(() => {
      setCategoryDetailVisible(true);
    }, 400);
  };

  // Fetch categories list
  const loadCategories = async () => {
    try {
      const data = await getAllCategories();
      setCategories(data);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  // Fetch books of selected category
  const loadCategoryBooks = async (catId: number) => {
    try {
      const books = await getFilteredBooks({ categoryId: catId });
      setCategoryBooks(books);
    } catch (error) {
      console.error('Error loading category books:', error);
    }
  };

  // Reload categories list on tab focus
  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [])
  );

  // Load books of active category whenever selectedCategory changes
  useEffect(() => {
    if (selectedCategory) {
      loadCategoryBooks(selectedCategory.id);
    }
  }, [selectedCategory]);

  // Handle open category add/edit modal
  const openCategoryModal = (cat: Category | null = null) => {
    if (cat) {
      setEditingCategory(cat);
      setNewCatName(cat.name);
      setNewCatIcon(cat.icon);
    } else {
      setEditingCategory(null);
      setNewCatName('');
      setNewCatIcon('book');
    }
    setCatModalVisible(true);
  };

  // Save/Create Category
  const handleSaveCategory = async () => {
    if (!newCatName.trim()) {
      Alert.alert(t('warning'), t('category_name_placeholder'));
      return;
    }

    try {
      if (editingCategory) {
        // Update existing category
        await updateCategory(editingCategory.id, newCatName.trim(), newCatIcon);
        if (selectedCategory && selectedCategory.id === editingCategory.id) {
          setSelectedCategory({ ...selectedCategory, name: newCatName.trim(), icon: newCatIcon });
        }
      } else {
        // Create new category
        await addCategory(newCatName.trim(), newCatIcon);
      }
      setCatModalVisible(false);
      loadCategories();
    } catch (error) {
      console.error('Category save error:', error);
      Alert.alert(t('error'), t('category_add_exists'));
    }
  };

  // Delete Category
  const handleDeleteCategory = (cat: Category) => {
    Alert.alert(
      t('category_delete_title'),
      t('category_delete_confirm', { name: cat.name }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategory(cat.id);
              setCatModalVisible(false);
              setCategoryDetailVisible(false);
              setSelectedCategory(null);
              loadCategories();
            } catch (error) {
              console.error('Category delete error:', error);
              Alert.alert(t('error'), t('category_delete_error'));
            }
          }
        }
      ]
    );
  };

  // Open book assign modal (shows all books in library to link them to this category)
  const openBookAssignModal = () => {
    setCategoryDetailVisible(false);
    setExpandedBookId(null);
    setTimeout(async () => {
      try {
        const data = await getAllBooks();
        setAllBooksList(data);
        setBookAssignModalVisible(true);
      } catch (error) {
        console.error('Error getting all books:', error);
      }
    }, 400);
  };

  // Link / Unlink book to this category
  const toggleBookAssociation = async (book: Book) => {
    if (!selectedCategory) return;

    try {
      const isCurrentlyAssociated = book.category_id === selectedCategory.id;
      const targetCategoryId = isCurrentlyAssociated ? null : selectedCategory.id;
      
      await associateBookToCategory(book.id, targetCategoryId);
      
      loadCategoryBooks(selectedCategory.id);
      loadCategories();
      
      setAllBooksList(prevList =>
        prevList.map(b => (b.id === book.id ? { ...b, category_id: targetCategoryId } : b))
      );
    } catch (error) {
      console.error('Error toggling book association:', error);
    }
  };

  const navigateToAddBookWithCategory = () => {
    if (!selectedCategory) return;
    
    setCategoryDetailVisible(false);
    const catId = selectedCategory.id;
    setTimeout(() => {
      setSelectedCategory(null);
      router.push({
        pathname: '/add',
        params: { categoryId: catId }
      });
    }, 400);
  };

  const renderCategoryCard = useCallback(({ item }: { item: Category }) => {
    const catColors = getCategoryColor(item.name, colorScheme === 'dark');
    return (
      <TouchableOpacity
        style={[styles.categoryCard, { backgroundColor: colors.backgroundElement }]}
        onPress={() => {
          setSelectedCategory(item);
          setCategoryDetailVisible(true);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.catLeftRow}>
          <View style={[styles.catIconBox, { backgroundColor: catColors.bg }]}>
            <Ionicons name={item.icon as any} size={24} color={catColors.color} />
          </View>
          <View style={styles.catTextContainer}>
            <Text style={[styles.catTitle, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.catSubtext, { color: colors.textSecondary }]}>
              {t('category_books_count', { count: item.book_count || 0 })}
            </Text>
          </View>
        </View>

        <View style={styles.catRightRow}>
          {item.name !== 'Diğer' && item.name !== 'Other' ? (
            <TouchableOpacity style={styles.editIconBtn} onPress={() => openCategoryModal(item)}>
              <Ionicons name="create-outline" size={20} color="#8E8E93" />
            </TouchableOpacity>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color="#8E8E93" />
        </View>
      </TouchableOpacity>
    );
  }, [colors, colorScheme, t]);

  const categoryKeyExtractor = useCallback((item: Category) => item.id.toString(), []);
  const bookKeyExtractor = useCallback((item: Book) => item.id.toString(), []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Category List */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
          {t('categories_subtitle', { count: categories.length })}
        </Text>
        <TouchableOpacity style={styles.addCategoryBtn} onPress={() => openCategoryModal(null)}>
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={styles.addCategoryBtnText}>{language === 'tr' ? 'Kategori Ekle' : 'Add Category'}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={categories}
        renderItem={renderCategoryCard}
        keyExtractor={categoryKeyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={8}
        ListEmptyComponent={
          <View style={styles.centerContainer}>
            <Ionicons name="grid-outline" size={64} color="#AEAEB2" />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {language === 'tr' ? 'Kategori bulunamadı.' : 'No categories found.'}
            </Text>
          </View>
        }
      />

      {/* Add/Edit Category Modal */}
      <Modal
        visible={catModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setCatModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editingCategory ? (language === 'tr' ? 'Kategoriyi Düzenle' : 'Edit Category') : t('category_add_new')}
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.backgroundElement,
                  color: colors.text,
                  borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6',
                },
              ]}
              placeholder={t('category_name_placeholder')}
              placeholderTextColor="#8E8E93"
              value={newCatName}
              onChangeText={setNewCatName}
            />

            <Text style={[styles.iconPickerLabel, { color: colors.text }]}>
              {language === 'tr' ? 'Bir Simge Seçin' : 'Select an Icon'}
            </Text>
            
            {/* Grid of icons */}
            <ScrollView style={styles.iconGridScroll} contentContainerStyle={styles.iconGrid} showsVerticalScrollIndicator={false}>
              {ICON_OPTIONS.map((iconName) => {
                const isSelected = newCatIcon === iconName;
                return (
                  <TouchableOpacity
                    key={iconName}
                    style={[
                      styles.iconSelector,
                      {
                        backgroundColor: isSelected ? '#0A84FF' : colors.backgroundElement,
                      },
                    ]}
                    onPress={() => setNewCatIcon(iconName)}
                  >
                    <Ionicons name={iconName as any} size={20} color={isSelected ? '#FFF' : '#8E8E93'} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalBtnRow}>
              {/* Cancel */}
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setCatModalVisible(false)}>
                <Text style={[styles.btnSecondaryText, { color: colors.text }]}>{t('cancel')}</Text>
              </TouchableOpacity>

              {/* Delete button (only if editing) */}
              {editingCategory ? (
                <TouchableOpacity
                  style={[styles.btnSecondary, styles.btnDelete]}
                  onPress={() => handleDeleteCategory(editingCategory)}
                >
                  <Text style={styles.btnDeleteText}>{t('delete')}</Text>
                </TouchableOpacity>
              ) : null}

              {/* Save */}
              <TouchableOpacity style={styles.btnPrimary} onPress={handleSaveCategory}>
                <Text style={styles.btnPrimaryText}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Category Books Detail View (Overlay Modal) */}
      <Modal
        visible={categoryDetailVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={closeCategoryDetail}
      >
        {selectedCategory && (
          <View style={[styles.subContainer, { backgroundColor: colors.background }]}>
            {/* Sub-view header */}
            <View style={[styles.subHeader, { borderBottomColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]}>
              <TouchableOpacity style={styles.subHeaderClose} onPress={closeCategoryDetail}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <View style={styles.subHeaderTitleContainer}>
                <Ionicons 
                  name={selectedCategory.icon as any} 
                  size={22} 
                  color={getCategoryColor(selectedCategory.name, colorScheme === 'dark').color} 
                />
                <Text style={[styles.subHeaderTitle, { color: colors.text }]}>{selectedCategory.name}</Text>
              </View>
              <Text style={styles.subHeaderCount}>{t('category_books_count', { count: categoryBooks.length })}</Text>
            </View>

            {/* Actions for this category */}
            <View style={styles.subActionRow}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.backgroundElement }]} onPress={openBookAssignModal}>
                <Ionicons name="link-outline" size={18} color="#0A84FF" />
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  {language === 'tr' ? 'Kitapları Eşleştir' : 'Match Books'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnGreen]} onPress={navigateToAddBookWithCategory}>
                <Ionicons name="add" size={18} color="#FFF" />
                <Text style={[styles.actionBtnText, { color: '#FFF' }]}>{t('nav_add_book')}</Text>
              </TouchableOpacity>
            </View>

            {/* Book List in Category */}
            <FlatList
              data={categoryBooks}
              keyExtractor={bookKeyExtractor}
              contentContainerStyle={styles.listContent}
              removeClippedSubviews={true}
              maxToRenderPerBatch={10}
              windowSize={5}
              initialNumToRender={8}
              renderItem={({ item }) => (
                <View style={[styles.assignBookRow, { backgroundColor: colors.backgroundElement }]}>
                  <View style={styles.assignBookInfo}>
                    <Text style={[styles.assignBookTitle, { color: colors.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.assignBookAuthor, { color: colors.textSecondary }]}>
                      {item.author || t('unknown_author')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.unlinkBtn}
                    onPress={() => toggleBookAssociation(item)}
                  >
                    <Ionicons name="close-circle-outline" size={22} color="#FF453A" />
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.centerContainer}>
                  <Ionicons name="book-outline" size={60} color="#AEAEB2" />
                  <Text style={[styles.emptyText, { color: colors.textSecondary, marginTop: 12 }]}>
                    {t('category_books_empty')}
                  </Text>
                  <Text style={[styles.emptySub, { color: colors.textSecondary, textAlign: 'center', marginTop: 8 }]}>
                    {language === 'tr'
                      ? 'Yukarıdaki "Kitapları Eşleştir" butonu ile kütüphanenizdeki kitapları bu kategoriye ekleyebilirsiniz.'
                      : 'Use the "Match Books" button above to add books to this category.'}
                  </Text>
                </View>
              }
            />
          </View>
        )}
      </Modal>

      {/* Book Assignment / Linking Modal */}
      <Modal
        visible={bookAssignModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseAssignModal}
      >
        {selectedCategory && (
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContentLarge, { backgroundColor: colors.background }]}>
              <View style={styles.modalLargeHeader}>
                <Text style={[styles.modalLargeTitle, { color: colors.text }]}>
                  {language === 'tr' ? 'Kitapları Eşleştir' : 'Match Books'}
                </Text>
                <TouchableOpacity onPress={handleCloseAssignModal}>
                  <Ionicons name="close" size={26} color={colors.text} />
                </TouchableOpacity>
              </View>
              
              <Text style={[styles.modalLargeSub, { color: colors.textSecondary }]}>
                {language === 'tr'
                  ? `"${selectedCategory.name}" kategorisine eklemek istediğiniz kitapları işaretleyin.`
                  : `Select the books you want to add to the "${selectedCategory.name}" category.`}
              </Text>

              <FlatList
                data={allBooksList}
                keyExtractor={bookKeyExtractor}
                contentContainerStyle={styles.assignListContainer}
                removeClippedSubviews={true}
                maxToRenderPerBatch={10}
                windowSize={5}
                initialNumToRender={8}
                renderItem={({ item }) => {
                  const isChecked = item.category_id === selectedCategory.id;
                  const isExpanded = expandedBookId === item.id;
                  return (
                    <View style={[styles.assignListItemContainer, { borderBottomColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]}>
                      <View style={styles.assignListItemRow}>
                        <TouchableOpacity
                          style={styles.assignListItemInfo}
                          onPress={() => setExpandedBookId(isExpanded ? null : item.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.assignListItemTitle, { color: colors.text }]} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={[styles.assignListItemAuthor, { color: colors.textSecondary }]}>
                            {item.author || t('unknown_author')}
                          </Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          style={styles.checkboxTouch}
                          onPress={() => toggleBookAssociation(item)}
                          activeOpacity={0.7}
                        >
                          <View style={[
                            styles.checkbox,
                            {
                              backgroundColor: isChecked ? '#34C759' : 'transparent',
                              borderColor: isChecked ? '#34C759' : '#8E8E93'
                            }
                          ]}>
                            {isChecked ? (
                              <Ionicons name="checkmark" size={14} color="#FFF" />
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      </View>

                      {isExpanded && (
                        <View style={[styles.assignListItemDetails, { backgroundColor: colorScheme === 'dark' ? '#1C1C1E' : '#F2F2F7' }]}>
                          {item.photo_path ? (
                            <Image source={{ uri: item.photo_path }} style={styles.detailCoverImage} />
                          ) : (
                            <View style={[styles.detailPlaceholderCover, { backgroundColor: colorScheme === 'dark' ? '#2E2F33' : '#E5E5EA' }]}>
                              <Ionicons name="book-outline" size={24} color="#8E8E93" />
                            </View>
                          )}

                          <View style={styles.detailTextContainer}>
                            {item.page_count > 0 && (
                              <Text style={[styles.detailText, { color: colors.text }]}>
                                📄 {t('pages_count', { count: item.page_count })}
                              </Text>
                            )}
                            {item.isbn ? (
                              <Text style={[styles.detailText, { color: colors.text, marginTop: 4 }]}>
                                🔗 ISBN: {item.isbn}
                              </Text>
                            ) : null}
                            <Text style={[styles.detailText, { color: colors.text, marginTop: 4 }]}>
                              📖 {language === 'tr' ? 'Durum' : 'Status'}: {getStatusText(item.status)}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.centerContainer}>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('books_empty')}</Text>
                  </View>
                }
              />

              <TouchableOpacity style={styles.assignDoneBtn} onPress={handleCloseAssignModal}>
                <Text style={styles.assignDoneBtnText}>{t('ok')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerSub: {
    fontSize: 14,
    marginBottom: 12,
  },
  addCategoryBtn: {
    backgroundColor: '#0A84FF',
    flexDirection: 'row',
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  addCategoryBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  catLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  catIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  catTextContainer: {
    flex: 1,
  },
  catTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  catSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  catRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editIconBtn: {
    padding: 6,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 30,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    lineHeight: 18,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  iconPickerLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  iconGridScroll: {
    maxHeight: 150,
    marginBottom: 20,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 10,
  },
  iconSelector: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnSecondary: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#AEAEB2',
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  btnDelete: {
    borderColor: '#FF453A',
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
  },
  btnDeleteText: {
    color: '#FF453A',
    fontSize: 15,
    fontWeight: '600',
  },
  btnPrimary: {
    flex: 1,
    height: 44,
    backgroundColor: '#34C759',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  // Sub Category View Styles
  subContainer: {
    flex: 1,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  subHeaderClose: {
    padding: 6,
  },
  subHeaderTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subHeaderTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  subHeaderCount: {
    fontSize: 14,
    color: '#8E8E93',
  },
  subActionRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionBtnGreen: {
    backgroundColor: '#34C759',
  },
  assignBookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
  },
  assignBookInfo: {
    flex: 1,
    marginRight: 10,
  },
  assignBookTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  assignBookAuthor: {
    fontSize: 13,
    marginTop: 2,
  },
  unlinkBtn: {
    padding: 6,
  },
  // Large Assign Modal
  modalContentLarge: {
    width: '100%',
    height: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    marginTop: 'auto',
  },
  modalLargeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalLargeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalLargeSub: {
    fontSize: 13,
    marginBottom: 16,
  },
  assignListContainer: {
    paddingBottom: 20,
  },
  assignListItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  assignListItemTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  assignListItemAuthor: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assignDoneBtn: {
    backgroundColor: '#0A84FF',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 15,
  },
  assignDoneBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  assignListItemContainer: {
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  assignListItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkboxTouch: {
    padding: 10,
    marginRight: -10,
  },
  assignListItemDetails: {
    flexDirection: 'row',
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
    gap: 14,
  },
  detailCoverImage: {
    width: 45,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#E5E5EA',
  },
  detailPlaceholderCover: {
    width: 45,
    height: 60,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  detailText: {
    fontSize: 13,
  },
});
