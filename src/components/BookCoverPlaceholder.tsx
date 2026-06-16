import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

interface BookCoverPlaceholderProps {
  title: string;
  author?: string;
  width: number;
  height: number;
  borderRadius?: number;
}

// 5 premium pastel gradient style variations
const PALETTES = [
  { colors: ['#E0C3FC', '#8EC5FC'], textColor: '#3F3D56', label: 'Lavender Blue' },
  { colors: ['#FFECD2', '#FCB69F'], textColor: '#4A3B32', label: 'Peach Sunrise' },
  { colors: ['#84FAB0', '#8FD3F4'], textColor: '#2A4E4F', label: 'Mint Breeze' },
  { colors: ['#A1C4FD', '#C2E9FB'], textColor: '#2B3D52', label: 'Sky Soft' },
  { colors: ['#FAD0C4', '#FFD1FF'], textColor: '#523E45', label: 'Rose Gold' }
];

export default function BookCoverPlaceholder({
  title = '',
  author = '',
  width,
  height,
  borderRadius = 12
}: BookCoverPlaceholderProps) {
  // Generate a deterministic index based on title characters code sum
  const cleanTitle = title.trim();
  const titleSum = cleanTitle.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const paletteIndex = titleSum % PALETTES.length;
  const palette = PALETTES[paletteIndex];

  // Get initial character safely
  const initial = cleanTitle ? cleanTitle.charAt(0).toUpperCase() : '?';

  return (
    <View
      style={[
        styles.cover,
        {
          width,
          height,
          borderRadius,
          backgroundColor: palette.colors[1] // fallback for non-gradient rendering
        }
      ]}
    >
      {/* Dynamic simple gradient using absolute views (clean & lightweight, no extra library dependency) */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.colors[0], opacity: 0.85 }]} />
      
      {/* Stylized top border accent */}
      <View style={[styles.accentBar, { backgroundColor: palette.textColor, opacity: 0.15 }]} />

      <View style={styles.content}>
        {/* Book Initial inside a delicate ring */}
        <View style={[styles.initialRing, { borderColor: palette.textColor }]}>
          <Text style={[styles.initialText, { color: palette.textColor }]}>
            {initial}
          </Text>
        </View>

        {/* Book Title & Author */}
        <View style={styles.textContainer}>
          <Text
            numberOfLines={2}
            style={[
              styles.title,
              {
                color: palette.textColor,
                fontSize: width > 100 ? 12 : 9,
                lineHeight: width > 100 ? 16 : 12
              }
            ]}
          >
            {cleanTitle}
          </Text>
          {author ? (
            <Text
              numberOfLines={1}
              style={[
                styles.author,
                {
                  color: palette.textColor,
                  fontSize: width > 100 ? 10 : 7,
                  opacity: 0.8
                }
              ]}
            >
              {author}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Book spine line accent for realism */}
      <View style={styles.spineLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 8,
  },
  content: {
    flex: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 14,
  },
  initialRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    opacity: 0.8,
  },
  initialText: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  textContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginHorizontal: 2,
  },
  author: {
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 2,
  },
  spineLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
  }
});
