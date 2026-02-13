import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  StatusBar,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Calendar from 'expo-calendar';
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function App() {
  const [image, setImage] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);

  // 画像をギャラリーから選択
  const pickImage = async () => {
    setError(null);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('ギャラリーへのアクセス許可が必要です');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        base64: true,
      });

      if (!result.canceled) {
        setImage(result.assets[0]);
        analyzeShift(result.assets[0]);
      }
    } catch (e) {
      setError('画像選択中にエラーが発生しました');
    }
  };

  // カメラで撮影
  const takePhoto = async () => {
    setError(null);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setError('カメラへのアクセス許可が必要です');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
      base64: true,
    });

    if (!result.canceled) {
      setImage(result.assets[0]);
      analyzeShift(result.assets[0]);
    }
  };

  const analyzeShift = async (imageData) => {
    setLoading(true);
    setError(null);
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

    try {
      if (!apiKey || apiKey === 'your_key_here') {
        setError('設定エラー: .envファイルまたはGitHub Secretsに geminiApiKey (EXPO_PUBLIC_GEMINI_API_KEY) が設定されていません');
        setLoading(false);
        return;
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      // 利用可能なモデルに変更 (リストにある gemini-flash-latest を使用)
      const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

      const currentYear = new Date().getFullYear();
      const prompt = `この画像からシフト情報を抽出してください。
                  
以下のJSON形式で返してください（JSONのみ、他の説明は不要）：
{
  "shifts": [
    {
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "title": "予定のタイトル"
    }
  ]
}

注意事項：
- dateは必ず YYYY-MM-DD 形式（例: ${currentYear}-02-10）
- startTimeとendTimeは HH:MM 形式（例: 09:00, 17:30）
- 年が書いていない場合は、今年の「${currentYear}年」として扱ってください
- 複数の予定がある場合は配列に全て含める
- JSONのみを返し、マークダウンのコードブロックは使わないでください`;

      const image = {
        inlineData: {
          data: imageData.base64,
          mimeType: imageData.uri.includes('.png') ? "image/png" : "image/jpeg",
        },
      };

      const result = await model.generateContent([prompt, image]);
      const response = await result.response;
      let text = response.text();

      console.log("Gemini Response:", text);

      // マークダウンのコードブロックを削除
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      try {
        const parsedData = JSON.parse(text);
        if (parsedData.shifts && Array.isArray(parsedData.shifts)) {
          setShifts(parsedData.shifts.map((shift, index) => ({
            ...shift,
            id: index,
          })));
          setEditing(true);
        } else {
          setError('シフト情報を正しく抽出できませんでした\nAIの応答: ' + text.substring(0, 100));
        }
      } catch (e) {
        console.error("JSON Parse Error:", e);
        setError('AIからの応答を解析できませんでした\n' + e.message);
      }

    } catch (error) {
      console.error('解析エラー:', error);
      setError(`シフトの解析に失敗しました: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Googleカレンダー用のURLを作成 (Web用)
  const createGoogleCalendarUrl = (shift) => {
    const formatDate = (dateString, timeString) => {
      // YYYY-MM-DD と HH:MM を結合して YYYYMMDDTHHMM00 形式にする
      // 区切り文字(-)を削除
      const date = dateString.replace(/-/g, '');
      const time = timeString.replace(/:/g, '');
      return `${date}T${time}00`;
    };

    const start = formatDate(shift.date, shift.startTime);
    const end = formatDate(shift.date, shift.endTime);
    const title = encodeURIComponent(shift.title || 'シフト');

    // ctz=Asia/Tokyo でタイムゾーン指定
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&ctz=Asia/Tokyo`;
  };

  // Webでカレンダーに追加ボタンが押されたとき
  const addToGoogleCalendarWeb = (shift) => {
    const url = createGoogleCalendarUrl(shift);
    Linking.openURL(url);
  };

  // カレンダーに追加ボタンが押されたとき (Mobile用 & Web用)
  const addToCalendar = async () => {
    if (shifts.length === 0) {
      Alert.alert('エラー', '登録する予定がありません');
      return;
    }

    // Webの場合は.icsファイルを生成してダウンロード
    if (Platform.OS === 'web') {
      try {
        let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Shift Calendar App//EN\n";

        shifts.forEach(shift => {
          const startDate = shift.date.replace(/-/g, '') + 'T' + shift.startTime.replace(/:/g, '') + '00';
          const endDate = shift.date.replace(/-/g, '') + 'T' + shift.endTime.replace(/:/g, '') + '00';

          icsContent += "BEGIN:VEVENT\n";
          icsContent += `SUMMARY:${shift.title}\n`;
          icsContent += `DTSTART;TZID=Asia/Tokyo:${startDate}\n`;
          icsContent += `DTEND;TZID=Asia/Tokyo:${endDate}\n`;
          icsContent += "END:VEVENT\n";
        });

        icsContent += "END:VCALENDAR";

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'shifts.ics');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        Alert.alert('完了', 'カレンダーファイル(.ics)をダウンロードしました。\nファイルを開いてカレンダーに追加してください。');
      } catch (e) {
        console.error(e);
        Alert.alert('エラー', 'カレンダーファイルの作成に失敗しました');
      }
      return;
    }

    // Native (iOS/Android) の場合はExpo Calendarを使用
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('エラー', 'カレンダーへのアクセス許可が必要です');
        return;
      }

      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      // 1. デフォルトカレンダーを探す（iOSなど）
      let targetCalendar = calendars.find((cal) => cal.isPrimary);
      // 2. 見つからない場合、書き込み可能な最初のカレンダーを使う（AndroidのGoogleカレンダーなど）
      if (!targetCalendar) {
        targetCalendar = calendars.find((cal) => cal.allowsModifications);
      }

      if (!targetCalendar) {
        Alert.alert('エラー', '書き込み可能なカレンダーが見つかりません');
        return;
      }

      let successCount = 0;
      for (const shift of shifts) {
        try {
          const startDate = new Date(`${shift.date}T${shift.startTime}:00`);
          const endDate = new Date(`${shift.date}T${shift.endTime}:00`);

          await Calendar.createEventAsync(targetCalendar.id, {
            title: shift.title,
            startDate: startDate,
            endDate: endDate,
            timeZone: 'Asia/Tokyo',
            alarms: [
              {
                relativeOffset: -60, // 1時間前
                method: Calendar.AlarmMethod.ALERT,
              },
            ],
          });
          successCount++;
        } catch (error) {
          console.error('予定の登録エラー:', error);
        }
      }

      Alert.alert(
        '完了',
        `${successCount}件の予定をカレンダーに登録しました！`,
        [
          {
            text: 'OK',
            onPress: () => {
              setImage(null);
              setShifts([]);
              setEditing(false);
            },
          },
        ]
      );
    } catch (error) {
      console.error('カレンダー登録エラー:', error);
      Alert.alert('エラー', 'カレンダーへの登録に失敗しました');
    }
  };

  // 予定を更新
  const updateShift = (id, field, value) => {
    setShifts((prevShifts) =>
      prevShifts.map((shift) =>
        shift.id === id ? { ...shift, [field]: value } : shift
      )
    );
  };

  // 予定を削除
  const deleteShift = (id) => {
    setShifts((prevShifts) => prevShifts.filter((shift) => shift.id !== id));
  };

  const isWeb = Platform.OS === 'web';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={isWeb ? styles.webOuterContainer : styles.flexContainer}>
        <View style={isWeb ? styles.webInnerCard : styles.flexContainer}>
          <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            <View style={styles.header}>
              <Text style={styles.title}>ラクラクカレンダー</Text>
              <Text style={styles.subtitle}>シフト表を撮影して自動登録</Text>
            </View>

            {!image && !editing && (
              <View style={styles.buttonContainer}>
                <TouchableOpacity style={styles.button} onPress={pickImage}>
                  <Text style={styles.buttonText}>📁 ギャラリーから選択</Text>
                </TouchableOpacity>
                {!Platform.OS === 'web' && (
                  <TouchableOpacity style={styles.button} onPress={takePhoto}>
                    <Text style={styles.buttonText}>📷 カメラで撮影</Text>
                  </TouchableOpacity>
                )}
                {Platform.OS === 'web' && (
                  <Text style={styles.webNote}>※PCではカメラ撮影の代わりにファイルをアップロードしてください</Text>
                )}
              </View>
            )}

            {image && !editing && (
              <View style={styles.imageContainer}>
                <Image source={{ uri: image.uri }} style={styles.image} />
                {loading && (
                  <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>解析中...</Text>
                  </View>
                )}
                {error && (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>⚠️ {error}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Web版のみQRコードを表示（モバイルで読み取り用） */}
            {Platform.OS === 'web' && !image && !editing && (
              <View style={styles.qrContainer}>
                <Text style={styles.qrTitle}>スマホで読み取ってモバイルで開く</Text>
                <Image
                  style={{ width: 150, height: 150 }}
                  source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}` }}
                />
                <Text style={styles.qrNote}>※iPhone/Androidのカメラで読み取ってください</Text>
              </View>
            )}

            {editing && shifts.length > 0 && (
              <View style={styles.shiftsContainer}>
                <Text style={styles.sectionTitle}>抽出された予定</Text>
                <Text style={styles.sectionSubtitle}>内容を確認・編集してください</Text>

                {shifts.map((shift) => (
                  <View key={shift.id} style={styles.shiftCard}>
                    <TextInput
                      style={styles.input}
                      value={shift.date}
                      onChangeText={(text) => updateShift(shift.id, 'date', text)}
                      placeholder="日付 (YYYY-MM-DD)"
                    />
                    <View style={styles.timeRow}>
                      <TextInput
                        style={[styles.input, styles.timeInput]}
                        value={shift.startTime}
                        onChangeText={(text) => updateShift(shift.id, 'startTime', text)}
                        placeholder="開始 (HH:MM)"
                      />
                      <Text style={styles.timeSeparator}>〜</Text>
                      <TextInput
                        style={[styles.input, styles.timeInput]}
                        value={shift.endTime}
                        onChangeText={(text) => updateShift(shift.id, 'endTime', text)}
                        placeholder="終了 (HH:MM)"
                      />
                    </View>
                    <TextInput
                      style={styles.input}
                      value={shift.title}
                      onChangeText={(text) => updateShift(shift.id, 'title', text)}
                      placeholder="予定のタイトル"
                    />

                    {Platform.OS === 'web' ? (
                      <TouchableOpacity
                        style={styles.webCalButton}
                        onPress={() => addToGoogleCalendarWeb(shift)}
                      >
                        <Text style={styles.webCalButtonText}>📅 Googleカレンダーに追加</Text>
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteShift(shift.id)}
                    >
                      <Text style={styles.deleteButtonText}>削除</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity style={styles.addButton} onPress={addToCalendar}>
                  <Text style={styles.addButtonText}>カレンダーに一括登録</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setImage(null);
                    setShifts([]);
                    setEditing(false);
                  }}
                >
                  <Text style={styles.cancelButtonText}>キャンセル</Text>
                </TouchableOpacity>
              </View>
            )}

            {editing && shifts.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>予定が見つかりませんでした</Text>
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => {
                    setImage(null);
                    setEditing(false);
                  }}
                >
                  <Text style={styles.buttonText}>戻る</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#3E2723', // Dark Brown Background
  },
  flexContainer: {
    flex: 1,
  },
  webOuterContainer: {
    flex: 1,
    backgroundColor: '#EFEBE9', // Light Beige Background
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  webInnerCard: {
    width: '100%',
    maxWidth: 500,
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  contentContainer: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  header: {
    backgroundColor: '#4E342E', // Dark Brown
    padding: 30,
    paddingTop: 30,
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#D7CCC8', // Light Brown text
    opacity: 0.9,
  },
  buttonContainer: {
    padding: 20,
    gap: 15,
  },
  button: {
    backgroundColor: '#6D4C41', // Medium Brown
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  imageContainer: {
    padding: 20,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 400,
    borderRadius: 12,
    resizeMode: 'contain',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)', // Slightly more opaque
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    margin: 20,
    zIndex: 10, // Ensure it's on top
  },
  loadingText: {
    marginTop: 10,
    fontSize: 18, // Larger text
    color: '#4E342E',
    fontWeight: 'bold', // Bolder text
  },
  errorContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#FFEBEE',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF5350',
    zIndex: 20,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  shiftsContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#3E2723',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#8D6E63',
    marginBottom: 20,
  },
  shiftCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#EFEBE9',
  },
  input: {
    backgroundColor: '#FAFAFA',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#D7CCC8',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  timeInput: {
    flex: 1,
    marginBottom: 0,
  },
  timeSeparator: {
    marginHorizontal: 10,
    fontSize: 16,
    color: '#666',
  },
  deleteButton: {
    backgroundColor: '#BCAAA4', // Lighter Brown/Gray for delete
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 5,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: '#5D4037', // Dark Brown
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D7CCC8',
  },
  cancelButtonText: {
    color: '#8D6E63',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#8D6E63',
    marginBottom: 20,
  },
  webCalButton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#4E342E',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 5,
  },
  webCalButtonText: {
    color: '#4E342E',
    fontSize: 14,
    fontWeight: '600',
  },
  webNote: {
    fontSize: 12,
    color: '#8D6E63',
    textAlign: 'center',
    marginTop: 5,
  },
  qrContainer: {
    alignItems: 'center',
    marginTop: 20,
    padding: 20,
    backgroundColor: '#FFF8E1', // Very light yellow/beige
    borderRadius: 12,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  qrTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#4E342E',
  },
  qrNote: {
    fontSize: 12,
    color: '#8D6E63',
    marginTop: 5,
  },
});
