import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Modal
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { addBook, checkBookByIsbn, checkBookByTitleAndAuthor, getAllCategories, Category } from '@/services/db';
import { saveBookCover } from '@/services/fs';
import { fetchBookInfoByIsbn, downloadAndSaveCoverImage } from '@/services/api';
import BarcodeScanner from '@/components/barcode-scanner';
import { Ionicons } from '@expo/vector-icons';
import { usePreferences } from '@/context/PreferencesContext';

export default function AddBookScreen() {
  const { colors, colorScheme, t, language } = usePreferences();
  const router = useRouter();
  
  // Read params passed from other screens (e.g. from categories tab)
  const params = useLocalSearchParams<{ categoryId?: string }>();

  // Data states
  const [categories, setCategories] = useState<Category[]>([]);

  // Form states
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [pageCount, setPageCount] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Status states
  const [loading, setLoading] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [categorySelectorVisible, setCategorySelectorVisible] = useState(false);

  // Fetch categories list on mount
  const loadCategories = async () => {
    try {
      const data = await getAllCategories();
      setCategories(data);
      
      // If categoryId parameter is passed, pre-select it
      if (params && params.categoryId) {
        const catId = parseInt(params.categoryId, 10);
        if (!isNaN(catId)) {
          setCategoryId(catId);
        }
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const categoryIdParam = params?.categoryId;
  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [categoryIdParam])
  );

  // Open native camera to take a cover photo
  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('warning'), t('scanner_permission_req'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.6,
      ...(Platform.OS === 'android' && { presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN }),
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  // Open gallery to select a cover photo
  const handleSelectPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('warning'), t('scanner_permission_req'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.6,
      ...(Platform.OS === 'android' && { presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN }),
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handlePhotoPress = () => {
    Alert.alert(
      t('edit_cover_add'),
      t('edit_cover_select_source'),
      [
        { text: t('edit_cover_take_photo'), onPress: handleTakePhoto },
        { text: t('edit_cover_choose_gallery'), onPress: handleSelectPhoto },
        { text: t('cancel'), style: 'cancel' }
      ]
    );
  };

  // Handle barcode scanned
  const handleBarcodeScan = async (scannedIsbn: string) => {
    setScannerVisible(false);
    setLoading(true);
    setSuccessMessage(null);

    try {
      // Check for duplicates in SQLite first
      const existingBook = await checkBookByIsbn(scannedIsbn);
      if (existingBook) {
        Alert.alert(
          t('add_book_already_exists_title'),
          `${t('add_book_already_exists_msg', { title: existingBook.title })}\n\n${t('edit_author')}: ${existingBook.author || t('unknown_author')}`,
          [
            {
              text: t('cancel'),
              style: 'cancel',
              onPress: () => setLoading(false)
            },
            {
              text: t('add'),
              onPress: () => continueFetchingAfterIsbnCheck(scannedIsbn)
            }
          ]
        );
      } else {
        await continueFetchingAfterIsbnCheck(scannedIsbn);
      }
    } catch (error) {
      console.error('ISBN scan error:', error);
      Alert.alert(t('error'), t('add_book_scan_error'));
      setLoading(false);
    }
  };

  const continueFetchingAfterIsbnCheck = async (scannedIsbn: string) => {
    setIsbn(scannedIsbn);
    const info = await fetchBookInfoByIsbn(scannedIsbn);

    if (info) {
      setTitle(info.title);
      setAuthor(info.author);
      setPageCount(info.pageCount > 0 ? info.pageCount.toString() : '');
      setCategoryId(info.categoryId);
      
      if (info.photoUrl) {
        const localUri = await downloadAndSaveCoverImage(info.photoUrl);
        if (localUri) {
          setPhotoUri(localUri);
        }
      }
      setSuccessMessage(t('add_book_scan_success'));
    } else {
      Alert.alert(
        t('info'),
        t('add_book_scan_not_found'),
        [{ text: t('ok') }]
      );
    }
    setLoading(false);
  };

  // Save Book
  const handleSaveBook = async () => {
    if (!title.trim()) {
      Alert.alert(t('warning'), t('add_book_name_label'));
      return;
    }

    setLoading(true);
    setSuccessMessage(null);

    try {
      const duplicate = await checkBookByTitleAndAuthor(title, author);
      if (duplicate) {
        let proceed = false;
        await new Promise<void>((resolve) => {
          Alert.alert(
            t('add_book_already_exists_title'),
            t('add_book_already_exists_msg', { title: title }),
            [
              { text: t('cancel'), style: 'cancel', onPress: () => { proceed = false; resolve(); } },
              { text: t('add'), onPress: () => { proceed = true; resolve(); } }
            ]
          );
        });

        if (!proceed) {
          setLoading(false);
          return;
        }
      }

      let finalPhotoPath: string | null = null;
      if (photoUri) {
        if (photoUri.includes('cache') || photoUri.startsWith('content://')) {
          finalPhotoPath = await saveBookCover(photoUri);
        } else {
          finalPhotoPath = photoUri;
        }
      }

      const pagesNum = pageCount.trim() ? parseInt(pageCount.trim(), 10) : 0;

      await addBook(
        title,
        author,
        isbn,
        finalPhotoPath,
        pagesNum,
        categoryId
      );

      setSuccessMessage(t('add_book_success'));
      resetForm();
      
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);

    } catch (error) {
      console.error('Save book error:', error);
      Alert.alert(t('error'), t('add_book_error'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setAuthor('');
    setIsbn('');
    setPageCount('');
    setCategoryId(null);
    setPhotoUri(null);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
      keyboardVerticalOffset={100}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Success Banner */}
        {successMessage ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            <Text style={styles.successBannerText}>{successMessage}</Text>
          </View>
        ) : null}

        {/* Top Scan Barcode Button */}
        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => setScannerVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="barcode-outline" size={24} color="#FFF" />
          <Text style={styles.scanButtonText}>{t('add_book_scan_btn')}</Text>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]} />
          <Text style={[styles.dividerText, { color: colors.textSecondary }]}>
            {language === 'tr' ? 'veya elle bilgileri girin' : 'or enter details manually'}
          </Text>
          <View style={[styles.dividerLine, { backgroundColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]} />
        </View>

        {/* Cover Photo Box */}
        <View style={styles.photoSection}>
          <TouchableOpacity
            style={[
              styles.photoBox,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA',
              },
            ]}
            onPress={handlePhotoPress}
            activeOpacity={0.7}
          >
            {photoUri ? (
              <View style={styles.imageWrapper}>
                <Image source={{ uri: photoUri }} style={styles.coverPreview} />
                <View style={styles.photoOverlay}>
                  <Ionicons name="camera" size={24} color="#FFF" />
                  <Text style={styles.photoOverlayText}>{t('edit')}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera-outline" size={40} color="#8E8E93" />
                <Text style={[styles.photoPlaceholderText, { color: colors.textSecondary }]}>
                  {t('edit_cover_add')}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Form Inputs */}
        <View style={styles.formContainer}>
          {/* Book Title Input */}
          <Text style={[styles.label, { color: colors.text }]}>{t('add_book_name_label')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.backgroundElement,
                color: colors.text,
                borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6',
              },
            ]}
            placeholder={language === 'tr' ? 'Kitabın tam adını girin...' : 'Enter full book name...'}
            placeholderTextColor="#8E8E93"
            value={title}
            onChangeText={setTitle}
          />

          {/* Author Input */}
          <Text style={[styles.label, { color: colors.text }]}>{t('add_book_author_label')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.backgroundElement,
                color: colors.text,
                borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6',
              },
            ]}
            placeholder={language === 'tr' ? 'Yazar adını girin...' : 'Enter author name...'}
            placeholderTextColor="#8E8E93"
            value={author}
            onChangeText={setAuthor}
          />

          {/* Category Picker Trigger */}
          <Text style={[styles.label, { color: colors.text }]}>{t('add_book_cat_label')}</Text>
          <TouchableOpacity
            style={[
              styles.selectorInput,
              {
                backgroundColor: colors.backgroundElement,
                borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6',
              },
            ]}
            onPress={() => setCategorySelectorVisible(true)}
          >
            <Text style={{ color: colors.text, fontSize: 16 }}>
              {categories.find(c => c.id === categoryId)?.name || t('no_category')}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#8E8E93" />
          </TouchableOpacity>

          {/* Page Count Input */}
          <Text style={[styles.label, { color: colors.text }]}>{t('add_book_pages_label')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.backgroundElement,
                color: colors.text,
                borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6',
              },
            ]}
            placeholder={language === 'tr' ? 'İsteğe bağlı sayfa sayısı...' : 'Optional page count...'}
            placeholderTextColor="#8E8E93"
            value={pageCount}
            onChangeText={setPageCount}
            keyboardType="number-pad"
          />

          {/* ISBN Input */}
          <Text style={[styles.label, { color: colors.text }]}>{t('add_book_isbn_label')}</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.backgroundElement,
                color: colors.text,
                borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6',
              },
            ]}
            placeholder={language === 'tr' ? 'İsteğe bağlı barkod numarası...' : 'Optional barcode number...'}
            placeholderTextColor="#8E8E93"
            value={isbn}
            onChangeText={setIsbn}
            keyboardType="number-pad"
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          {loading ? (
            <ActivityIndicator size="large" color="#0A84FF" style={styles.spinner} />
          ) : (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[
                  styles.btnSecondary,
                  { borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6' },
                ]}
                onPress={resetForm}
              >
                <Text style={[styles.btnSecondaryText, { color: colors.text }]}>
                  {language === 'tr' ? 'Temizle' : 'Clear'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btnPrimary} onPress={handleSaveBook}>
                <Text style={styles.btnPrimaryText}>{t('add_book_save_btn')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Barcode Scanner Modal */}
      <BarcodeScanner
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={handleBarcodeScan}
      />

      {/* Category Picker Overlay Modal */}
      <Modal
        visible={categorySelectorVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCategorySelectorVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.categorySelectorModalContent, { backgroundColor: colors.background }]}>
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
                    setCategoryId(item.id);
                    setCategorySelectorVisible(false);
                  }}
                >
                  <Text style={[styles.selectorListItemTitle, { color: colors.text }]}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  successBanner: {
    backgroundColor: '#34C759',
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  successBannerText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
    flex: 1,
  },
  scanButton: {
    backgroundColor: '#0A84FF',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: 16,
    gap: 8,
    shadowColor: '#0A84FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  scanButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  photoBox: {
    width: 120,
    height: 160,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  coverPreview: {
    width: '100%',
    height: '100%',
  },
  photoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 4,
  },
  photoOverlayText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '500',
  },
  photoPlaceholder: {
    alignItems: 'center',
    padding: 10,
  },
  photoPlaceholderText: {
    fontSize: 13,
    marginTop: 8,
    fontWeight: '500',
    textAlign: 'center',
  },
  formContainer: {
    gap: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  selectorInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  btnSecondary: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
  },
  btnPrimary: {
    flex: 2,
    height: 50,
    backgroundColor: '#34C759',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  btnPrimaryText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  spinner: {
    paddingVertical: 10,
  },
  // Category Selector modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  categorySelectorModalContent: {
    width: '100%',
    height: '60%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
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
});
