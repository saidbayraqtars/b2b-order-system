import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button } from "@/components/ui";

// Kamerayla barkod/QR okuyan tam ekran katman.
//
// Neden ayrı bileşen: aynı hareket iki farklı yerde lazım. Katalogda "rafı
// okut, sepete at", teslimatta "sevkiyat etiketini okut, işi aç". İkisi de
// aynı kamerayı açıyor, sonuç dizisiyle ne yapılacağı çağırana ait.

// Sahada gerçekten karşılaşılan simgeler. Listeyi kısıtlamak bilerek: kamera ne
// kadar az biçim denerse o kadar hızlı kilitleniyor, ve okunmasını istemediğimiz
// bir şeyin (rastgele bir afişteki QR) yanlışlıkla ürün sanılması engelleniyor.
//
// EAN-13 marketteki standart, EAN-8 küçük ambalaj, UPC Amerikan menşeli mal,
// Code128 ve ITF depo/koli etiketi, QR kendi ürettiğimiz sevkiyat etiketleri.
const BARCODE_TYPES = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "itf14",
  "qr",
] as const;

export interface BarcodeScannerProps {
  visible: boolean;
  /** Başlıkta ne aradığımızı yazar: "Ürün barkodu okutun" gibi. */
  title: string;
  onClose: () => void;
  /**
   * Okunan değer. Kamera aynı barkodu saniyede onlarca kez bildiriyor, bu
   * yüzden ilk okumadan sonra dinleme kapatılıyor ve bir daha okunmuyor —
   * çağıran katmanı kapatana ya da `visible` yeniden açılana kadar.
   */
  onScan: (value: string) => void;
}

export function BarcodeScanner({
  visible,
  title,
  onClose,
  onScan,
}: BarcodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  // State değil ref: okuma geri çağrısı kamera tarafında çok sık tetikleniyor
  // ve state güncellemesi bir sonraki karede görünür oluyor. Aradaki birkaç
  // kare aynı barkodu ikinci kez sepete atmaya yetiyor.
  const handled = useRef(false);
  const [torch, setTorch] = useState(false);

  // İzin, katman açılınca sorulyor — açılıştan önce değil. Uygulamayı ilk kez
  // açan birine hiç kullanmayacağı bir özelliğin iznini sormak, sorunun kabul
  // edilme ihtimalini düşürüyor; kamera ekranı önünde sorulan izin ise ne için
  // istendiği belli olduğu için kendini açıklıyor.
  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (handled.current) return;
      const value = data.trim();
      if (!value) return;
      handled.current = true;
      onScan(value);
    },
    [onScan],
  );

  const close = useCallback(() => {
    handled.current = false;
    setTorch(false);
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onShow={() => {
        handled.current = false;
      }}
      onRequestClose={close}
    >
      <View className="flex-1 bg-black">
        {!permission ? null : !permission.granted ? (
          <View className="flex-1 items-center justify-center gap-4 p-6">
            <Text className="text-center text-base text-white">
              {permission.canAskAgain
                ? "Barkod okumak için kamera izni gerekiyor."
                : "Kamera izni kapalı. Telefon ayarlarından uygulamaya kamera izni verin."}
            </Text>
            {permission.canAskAgain ? (
              <Button
                title="İzin ver"
                onPress={() => void requestPermission()}
                className="w-full"
              />
            ) : null}
            <Button
              title="Kapat"
              variant="secondary"
              onPress={close}
              className="w-full"
            />
          </View>
        ) : (
          <>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={handleScan}
            />

            {/* Nişangâh: kameranın hangi bölgeyi okuduğuna dair bir söz değil —
                kütüphane tüm kareyi tarıyor. İşi, telefonu nereye tutacağını
                söylemek; barkodu ortalayan el daha çabuk okutuyor. */}
            <View className="absolute inset-x-0 top-0 bottom-0 items-center justify-center">
              <View className="h-40 w-72 rounded-2xl border-2 border-white/80" />
            </View>

            <View className="absolute inset-x-0 top-0 p-4 pt-14">
              <Text className="text-center text-base font-semibold text-white">
                {title}
              </Text>
            </View>

            <View className="absolute inset-x-0 bottom-0 flex-row gap-3 p-4 pb-10">
              <Button
                title={torch ? "Işığı kapat" : "Işık"}
                variant="secondary"
                onPress={() => setTorch((t) => !t)}
                className="flex-1"
              />
              <Pressable
                accessibilityRole="button"
                onPress={close}
                className="h-12 flex-1 items-center justify-center rounded-xl bg-white/20"
              >
                <Text className="text-base font-semibold text-white">Vazgeç</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
