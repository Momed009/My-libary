import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, ActivityIndicator, Animated } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface BarcodeScannerProps {
  visible: boolean;
  onClose: () => void;
  onScan: (isbn: string) => void;
}

export default function BarcodeScanner({ visible, onClose, onScan }: BarcodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);
  const scanLineAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    if (visible) {
      setScanned(false);
      setTorch(false);
      
      // Start the scanner red line animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 200,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [visible]);

  if (!visible) return null;

  const handleBarcodeScanned = ({ type, data }: { type: string; data: string }) => {
    // Standard ISBN barcodes are EAN-13 (typically starts with 978 or 979)
    if (scanned) return;
    setScanned(true);
    onScan(data);
  };

  const handleRequestPermission = async () => {
    await requestPermission();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {!permission ? (
          // Permission is loading
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.infoText}>Kamera izinleri kontrol ediliyor...</Text>
          </View>
        ) : !permission.granted ? (
          // Permission not granted
          <View style={styles.centerContainer}>
            <Text style={styles.errorTitle}>Kamera Erişimi Gerekli</Text>
            <Text style={styles.errorText}>
              Kitap barkodlarını taramak için kamera iznine ihtiyacımız var.
            </Text>
            <TouchableOpacity style={styles.permissionButton} onPress={handleRequestPermission}>
              <Text style={styles.permissionButtonText}>İzin Ver</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeTextButton} onPress={onClose}>
              <Text style={styles.closeTextButtonText}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Camera active
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
            }}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          >
            {/* Viewfinder Overlay */}
            <View style={styles.overlayContainer}>
              <View style={styles.topOverlay}>
                <Text style={styles.titleText}>Barkod Tara</Text>
                <Text style={styles.subtitleText}>Kitabın arkasındaki barkodu ortalayın</Text>
              </View>

              <View style={styles.middleRow}>
                <View style={styles.sideOverlay} />
                <View style={styles.viewfinder}>
                  {/* Viewfinder corners */}
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                  
                  {/* Scan line */}
                  <Animated.View
                    style={[
                      styles.scanLine,
                      {
                        transform: [{ translateY: scanLineAnim }],
                      },
                    ]}
                  />
                </View>
                <View style={styles.sideOverlay} />
              </View>

              <View style={styles.bottomOverlay}>
                <View style={styles.buttonRow}>
                  {/* Torch Toggle */}
                  <TouchableOpacity style={styles.iconButton} onPress={() => setTorch(!torch)}>
                    <Text style={styles.iconButtonText}>{torch ? '🔦 Flaş Açık' : '🔦 Flaş Kapalı'}</Text>
                  </TouchableOpacity>

                  {/* Close Button */}
                  <TouchableOpacity style={[styles.iconButton, styles.cancelButton]} onPress={onClose}>
                    <Text style={[styles.iconButtonText, styles.cancelButtonText]}>Kapat</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </CameraView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#1C1C1E',
  },
  infoText: {
    marginTop: 16,
    color: '#AEAEB2',
    fontSize: 16,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#AEAEB2',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: '#0A84FF',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  permissionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  closeTextButton: {
    marginTop: 20,
    padding: 10,
  },
  closeTextButtonText: {
    color: '#AEAEB2',
    fontSize: 16,
  },
  overlayContainer: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  topOverlay: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingTop: 60,
    paddingBottom: 20,
    alignItems: 'center',
  },
  titleText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  subtitleText: {
    color: '#AEAEB2',
    fontSize: 14,
    marginTop: 6,
  },
  middleRow: {
    flexDirection: 'row',
    height: 220,
  },
  sideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  viewfinder: {
    width: 280,
    height: 220,
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#0A84FF',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  scanLine: {
    height: 2,
    backgroundColor: '#FF453A',
    width: '100%',
    shadowColor: '#FF453A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  bottomOverlay: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingBottom: 50,
    paddingTop: 20,
    alignItems: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  iconButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#FF453A',
  },
  cancelButtonText: {
    color: '#FFF',
  },
});
