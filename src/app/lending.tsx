import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Image
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getActiveLendings, returnLending, getAllBooks, addLending, Lending, Book } from '@/services/db';
import * as Calendar from 'expo-calendar';
import { Ionicons } from '@expo/vector-icons';
import { usePreferences } from '@/context/PreferencesContext';

export default function LendingScreen() {
  const { colors, colorScheme, t, language } = usePreferences();

  // Data states
  const [activeLendings, setActiveLendings] = useState<Lending[]>([]);
  const [availableBooks, setAvailableBooks] = useState<Book[]>([]);

  // Modal states
  const [lendModalVisible, setLendModalVisible] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [borrowerName, setBorrowerName] = useState('');
  const [selectedDaysPreset, setSelectedDaysPreset] = useState(7); // default 7 days

  // Search states for book selection inside modal
  const [bookSearchQuery, setBookSearchQuery] = useState('');
  const [bookSelectorVisible, setBookSelectorVisible] = useState(false);

  const [loading, setLoading] = useState(false);

  // Load active lendings
  const loadLendings = async () => {
    try {
      const data = await getActiveLendings();
      setActiveLendings(data);
    } catch (error) {
      console.error('Error loading lendings:', error);
    }
  };

  // Reload data on tab focus
  useFocusEffect(
    useCallback(() => {
      loadLendings();
    }, [])
  );

  // Request calendar permission and return default calendar ID
  const getDeviceCalendarId = async (): Promise<string | null> => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        return null; // Permission denied
      }

      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writableCal = calendars.find((c) => c.allowsModifications) || calendars[0];
      return writableCal ? writableCal.id : null;
    } catch (error) {
      console.error('Calendar permission/access error:', error);
      return null;
    }
  };

  // Create calendar event
  const createCalendarEvent = async (
    bookTitle: string,
    borrower: string,
    dueDate: Date
  ): Promise<string | null> => {
    const calendarId = await getDeviceCalendarId();
    if (!calendarId) return null;

    try {
      const startDate = new Date(dueDate);
      startDate.setHours(10, 0, 0, 0); // Start reminder at 10:00 AM on due date
      
      const endDate = new Date(dueDate);
      endDate.setHours(11, 0, 0, 0);

      const eventId = await Calendar.createEventAsync(calendarId, {
        title: language === 'tr' ? `Kitap İade Hatırlatması: ${bookTitle}` : language === 'ar' ? `تذكير إرجاع الكتاب: ${bookTitle}` : `Book Return Reminder: ${bookTitle}`,
        startDate,
        endDate,
        notes: language === 'tr'
          ? `"${borrower}" kişisine ödünç verdiğiniz "${bookTitle}" kitabının bugün iade günü.`
          : language === 'ar'
          ? `كتاب "${bookTitle}" الذي أعرته إلى "${borrower}" يستحق اليوم.`
          : `The book "${bookTitle}" you lent to "${borrower}" is due today.`,
        alarms: [
          { relativeOffset: 0 },
          { relativeOffset: -60 * 2 }
        ],
      });

      return eventId;
    } catch (error) {
      console.error('Could not create calendar event:', error);
      return null;
    }
  };

  // Delete calendar event
  const deleteCalendarEvent = async (eventId: string): Promise<void> => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status === 'granted') {
        await Calendar.deleteEventAsync(eventId);
      }
    } catch (error) {
      console.warn('Error deleting calendar event:', error);
    }
  };

  // Open lend modal and load available books
  const openLendModal = async () => {
    try {
      const allBooks = await getAllBooks();
      const lendings = await getActiveLendings();
      const lentBookIds = lendings.map((l) => l.book_id);
      
      const available = allBooks.filter((b) => !lentBookIds.includes(b.id));
      
      setAvailableBooks(available);
      setSelectedBook(null);
      setBorrowerName('');
      setSelectedDaysPreset(7);
      setBookSearchQuery('');
      setBookSelectorVisible(false);
      setLendModalVisible(true);
    } catch (error) {
      console.error('Error loading books:', error);
    }
  };

  // Handle lending action
  const handleLend = async () => {
    if (!selectedBook) {
      Alert.alert(t('warning'), t('lending_missing_info'));
      return;
    }
    if (!borrowerName.trim()) {
      Alert.alert(t('warning'), t('lending_missing_info'));
      return;
    }

    setLoading(true);
    try {
      const returnDateObj = new Date();
      returnDateObj.setDate(returnDateObj.getDate() + selectedDaysPreset);
      const returnDateStr = returnDateObj.toISOString();

      let calendarEventId: string | null = null;
      try {
        calendarEventId = await createCalendarEvent(
          selectedBook.title,
          borrowerName.trim(),
          returnDateObj
        );
      } catch (e) {
        console.warn('Calendar event creation failed, proceeding with DB registration.');
      }

      await addLending(selectedBook.id, borrowerName.trim(), returnDateStr, calendarEventId);

      setLendModalVisible(false);
      loadLendings();
      
      let alertMsg = language === 'tr'
        ? `"${selectedBook.title}" kitabı ${borrowerName.trim()} kişisine başarıyla ödünç verildi.`
        : language === 'ar'
        ? `تمت إعارة كتاب "${selectedBook.title}" بنجاح إلى ${borrowerName.trim()}.`
        : `"${selectedBook.title}" was successfully lent to ${borrowerName.trim()}.`;
      if (calendarEventId) {
        alertMsg += '\n\n📅 ' + t('lending_calendar_added');
      }
      Alert.alert(t('success'), alertMsg);

    } catch (error) {
      console.error('Lending error:', error);
      Alert.alert(t('error'), t('lending_error'));
    } finally {
      setLoading(false);
    }
  };

  // Return book / Check-in
  const handleReturnBook = (lending: Lending) => {
    Alert.alert(
      t('lending_return_confirm_title'),
      t('lending_return_confirm_msg', { title: lending.book_title || '' }),
      [
        { text: t('no'), style: 'cancel' },
        {
          text: t('yes'),
          onPress: async () => {
            try {
              const calendarEventId = await returnLending(lending.id);
              if (calendarEventId) {
                await deleteCalendarEvent(calendarEventId);
              }
              loadLendings();
              Alert.alert(t('success'), t('lending_return_success'));
            } catch (error) {
              console.error('Return error:', error);
              Alert.alert(t('error'), t('lending_return_error'));
            }
          }
        }
      ]
    );
  };

  // Helper to calculate days remaining or overdue
  const getRemainingDaysInfo = useCallback((returnDateString: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(returnDateString);
    dueDate.setHours(0, 0, 0, 0);

    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const absDays = Math.abs(diffDays);
      return {
        text: language === 'tr' ? `${absDays} gün gecikti` : language === 'ar' ? `متأخر ${absDays} يوم` : `${absDays} days overdue`,
        isOverdue: true,
        style: styles.overdueDays
      };
    } else if (diffDays === 0) {
      return {
        text: language === 'tr' ? 'Bugün iade günü' : language === 'ar' ? 'تاريخ الإرجاع اليوم' : 'Due today',
        isOverdue: true,
        style: styles.todayDays
      };
    } else {
      return {
        text: language === 'tr' ? `${diffDays} gün kaldı` : language === 'ar' ? `متبقي ${diffDays} يوم` : `${diffDays} days remaining`,
        isOverdue: false,
        style: styles.remainingDays
      };
    }
  }, [language]);

  const formatDate = useCallback((dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(language === 'tr' ? 'tr-TR' : language === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateString;
    }
  }, [language]);

  const keyExtractor = useCallback((item: Lending | Book) => item.id.toString(), []);

  const filteredAvailableBooks = useMemo(() =>
    availableBooks.filter((book) =>
      book.title.toLowerCase().includes(bookSearchQuery.toLowerCase()) ||
      (book.author && book.author.toLowerCase().includes(bookSearchQuery.toLowerCase()))
    ), [availableBooks, bookSearchQuery]);

  const renderLendingItem = useCallback(({ item }: { item: Lending }) => {
    const daysInfo = getRemainingDaysInfo(item.return_date);
    return (
      <View style={[styles.lendingCard, { backgroundColor: colors.backgroundElement }]}>
        {/* Cover Photo */}
        {item.photo_path ? (
          <Image source={{ uri: item.photo_path }} style={styles.coverImage} />
        ) : (
          <View style={[styles.placeholderCover, { backgroundColor: colorScheme === 'dark' ? '#2E2F33' : '#E5E5EA' }]}>
            <Ionicons name="book-outline" size={24} color="#8E8E93" />
          </View>
        )}

        {/* Info */}
        <View style={styles.lendingInfo}>
          <Text style={[styles.bookTitle, { color: colors.text }]} numberOfLines={1}>
            {item.book_title}
          </Text>
          
          <View style={styles.borrowerRow}>
            <Ionicons name="person-outline" size={14} color="#8E8E93" />
            <Text style={[styles.borrowerName, { color: colors.text }]}>{item.borrower_name}</Text>
          </View>

          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={14} color="#8E8E93" />
            <Text style={styles.dateText}>
              {language === 'tr' ? 'Son İade: ' : language === 'ar' ? 'تاريخ الاستحقاق: ' : 'Due: '}{formatDate(item.return_date)}
            </Text>
          </View>
        </View>

        {/* Status Badge & Check-in button */}
        <View style={styles.rightActions}>
          <Text style={[styles.daysBadge, daysInfo.style]}>{daysInfo.text}</Text>
          <TouchableOpacity
            style={styles.returnBtn}
            onPress={() => handleReturnBook(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark-circle-outline" size={26} color="#34C759" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [colors, colorScheme, getRemainingDaysInfo, formatDate, language]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header and Add button */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
          {language === 'tr'
            ? 'Kimin hangi kitabı aldığını ve iade tarihlerini görün'
            : language === 'ar'
            ? 'تتبع من استعار أي كتاب وتواريخ الإرجاع المستحقة'
            : 'See who borrowed which book and their due dates'}
        </Text>
        <TouchableOpacity style={styles.lendBtn} onPress={openLendModal}>
          <Ionicons name="people-outline" size={18} color="#FFF" />
          <Text style={styles.lendBtnText}>{t('lend_book_btn')}</Text>
        </TouchableOpacity>
      </View>

      {/* Lending List */}
      <FlatList
        data={activeLendings}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={8}
        renderItem={renderLendingItem}
        ListEmptyComponent={
          <View style={styles.centerContainer}>
            <Ionicons name="people-outline" size={72} color={colorScheme === 'dark' ? '#2E2F33' : '#E5E5EA'} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('lending_empty')}</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              {language === 'tr'
                ? 'Arkadaşlarınıza verdiğiniz kitapları eklemek için yukarıdaki butona basın.'
                : language === 'ar'
                ? 'اضغط على الزر أعلاه لإضافة الكتب التي أعرتها لأصدقائك.'
                : 'Press the button above to add books you lent to your friends.'}
            </Text>
          </View>
        }
      />

      {/* Lend Modal */}
      <Modal
        visible={lendModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (bookSelectorVisible) {
            setBookSelectorVisible(false);
          } else {
            setLendModalVisible(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              bookSelectorVisible && { height: '75%' },
              { backgroundColor: colors.background }
            ]}
          >
            {bookSelectorVisible ? (
              <>
                <View style={styles.selectorHeader}>
                  <Text style={[styles.selectorTitle, { color: colors.text }]}>
                    {language === 'tr' ? 'Kitap Seç' : language === 'ar' ? 'اختر كتاباً' : 'Select Book'}
                  </Text>
                  <TouchableOpacity onPress={() => setBookSelectorVisible(false)}>
                    <Ionicons name="close" size={26} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Book Selector Search */}
                <View style={[styles.selectorSearchContainer, { backgroundColor: colors.backgroundElement }]}>
                  <Ionicons name="search-outline" size={18} color="#8E8E93" style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.selectorSearchInput, { color: colors.text }]}
                    placeholder={language === 'tr' ? 'Kitaplığınızda arayın...' : language === 'ar' ? 'ابحث في مكتبتك...' : 'Search in your library...'}
                    placeholderTextColor="#8E8E93"
                    value={bookSearchQuery}
                    onChangeText={setBookSearchQuery}
                  />
                </View>

                {/* Available Books List */}
                <FlatList
                  data={filteredAvailableBooks}
                  keyExtractor={keyExtractor}
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  initialNumToRender={8}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.selectorListItem, { borderBottomColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]}
                      onPress={() => {
                        setSelectedBook(item);
                        setBookSelectorVisible(false);
                      }}
                    >
                      <Text style={[styles.selectorListItemTitle, { color: colors.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[styles.selectorListItemAuthor, { color: colors.textSecondary }]}>
                        {item.author || t('unknown_author')}
                      </Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <View style={styles.centerContainer}>
                      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                        {availableBooks.length === 0
                          ? (language === 'tr' ? 'Tüm kitaplarınız zaten ödünç verilmiş!' : language === 'ar' ? 'جميع كتبك معارة بالفعل!' : 'All your books are already lent!')
                          : t('search_empty')}
                      </Text>
                    </View>
                  }
                />
              </>
            ) : (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{t('lending_new_title')}</Text>

                {/* Book Selector Trigger */}
                <Text style={[styles.label, { color: colors.text }]}>{language === 'tr' ? 'Ödünç Verilecek Kitap *' : language === 'ar' ? 'الكتاب المراد إعارته *' : 'Book to Lend *'}</Text>
                <TouchableOpacity
                  style={[
                    styles.selectorInput,
                    {
                      backgroundColor: colors.backgroundElement,
                      borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6',
                    },
                  ]}
                  onPress={() => setBookSelectorVisible(true)}
                >
                  <Text style={{ color: selectedBook ? colors.text : '#8E8E93', fontSize: 16 }}>
                    {selectedBook ? selectedBook.title : (language === 'tr' ? 'Kitap seçmek için tıklayın...' : language === 'ar' ? 'انقر لاختيار كتاب...' : 'Click to select a book...')}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#8E8E93" />
                </TouchableOpacity>

                {/* Borrower Name */}
                <Text style={[styles.label, { color: colors.text }]}>{language === 'tr' ? 'Kime Ödünç Veriliyor? *' : language === 'ar' ? 'معار إلى من؟ *' : 'Lent to? *'}</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.backgroundElement,
                      color: colors.text,
                      borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6',
                    },
                  ]}
                  placeholder={language === 'tr' ? 'Kişi adını girin...' : language === 'ar' ? 'أدخل اسم الشخص...' : "Enter borrower's name..."}
                  placeholderTextColor="#8E8E93"
                  value={borrowerName}
                  onChangeText={setBorrowerName}
                />

                {/* Return Period Preset */}
                <Text style={[styles.label, { color: colors.text }]}>{language === 'tr' ? 'Ödünç Süresi *' : language === 'ar' ? 'مدة الإعارة *' : 'Lending Period *'}</Text>
                <View style={styles.presetsContainer}>
                  {[
                    { days: 3, label: language === 'tr' ? '3 Gün' : language === 'ar' ? '٣ أيام' : '3 Days' },
                    { days: 7, label: language === 'tr' ? '1 Hafta' : language === 'ar' ? 'أسبوع واحد' : '1 Week' },
                    { days: 14, label: language === 'tr' ? '2 Hafta' : language === 'ar' ? 'أسبوعين' : '2 Weeks' },
                    { days: 30, label: language === 'tr' ? '1 Ay' : language === 'ar' ? 'شهر واحد' : '1 Month' },
                  ].map((preset) => {
                    const isSelected = selectedDaysPreset === preset.days;
                    return (
                      <TouchableOpacity
                        key={preset.days}
                        style={[
                          styles.presetBtn,
                          {
                            backgroundColor: isSelected ? '#0A84FF' : colors.backgroundElement,
                            borderColor: isSelected ? '#0A84FF' : colorScheme === 'dark' ? '#38383A' : '#D1D1D6',
                          },
                        ]}
                        onPress={() => setSelectedDaysPreset(preset.days)}
                      >
                        <Text style={[styles.presetBtnText, { color: isSelected ? '#FFF' : colors.text }]}>
                          {preset.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Save Actions */}
                <View style={styles.modalBtnRow}>
                  <TouchableOpacity
                    style={[styles.btnCancel, { borderColor: colorScheme === 'dark' ? '#38383A' : '#D1D1D6' }]}
                    onPress={() => setLendModalVisible(false)}
                  >
                    <Text style={[styles.btnCancelText, { color: colors.text }]}>{t('cancel')}</Text>
                  </TouchableOpacity>

                  {loading ? (
                    <ActivityIndicator size="small" color="#0A84FF" style={{ paddingHorizontal: 20 }} />
                  ) : (
                    <TouchableOpacity style={styles.btnConfirm} onPress={handleLend}>
                      <Text style={styles.btnConfirmText}>{language === 'tr' ? 'Ödünç Ver' : language === 'ar' ? 'إعارة الكتاب' : 'Lend Book'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
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
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerSub: {
    fontSize: 14,
    marginBottom: 12,
  },
  lendBtn: {
    backgroundColor: '#34C759',
    flexDirection: 'row',
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  lendBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  lendingCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  coverImage: {
    width: 44,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#E5E5EA',
  },
  placeholderCover: {
    width: 44,
    height: 60,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lendingInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  borrowerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  borrowerName: {
    fontSize: 13,
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  rightActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  daysBadge: {
    fontSize: 11,
    fontWeight: 'bold',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    overflow: 'hidden',
  },
  remainingDays: {
    backgroundColor: 'rgba(142,142,147,0.12)',
    color: '#8E8E93',
  },
  todayDays: {
    backgroundColor: 'rgba(255,149,0,0.15)',
    color: '#FF9500',
  },
  overdueDays: {
    backgroundColor: 'rgba(255,69,58,0.15)',
    color: '#FF453A',
  },
  returnBtn: {
    padding: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 14,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
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
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  selectorInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  presetsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  presetBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btnCancel: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  btnConfirm: {
    flex: 2,
    height: 48,
    backgroundColor: '#34C759',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnConfirmText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Book Selector Modal Styles
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
  selectorSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    marginBottom: 16,
  },
  selectorSearchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 6,
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
});
