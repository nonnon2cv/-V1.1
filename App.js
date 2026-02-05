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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Calendar from 'expo-calendar';
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function App() {
  const [image, setImage] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  // 画像をギャラリーから選択
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('エラー', 'ギャラリーへのアクセス許可が必要です');
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
      Alert.alert('エラー', '画像選択中にエラーが発生しました');
    }
  };

  // カメラで撮影
  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('エラー', 'カメラへのアクセス許可が必要です');
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
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

    try {
      if (!apiKey || apiKey === 'your_key_here') {
        Alert.alert('設定エラー', '.envファイルにGemini APIキーを設定してください');
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
          Alert.alert('エラー', 'シフト情報を正しく抽出できませんでした');
        }
      } catch (e) {
        console.error("JSON Parse Error:", e);
        Alert.alert('エラー', 'AIからの応答を解析できませんでした');
      }

    } catch (error) {
      console.error('解析エラー:', error);
      Alert.alert('エラー', `シフトの解析に失敗しました: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // カレンダーに追加
  const addToCalendar = async () => {
    if (shifts.length === 0) {
      Alert.alert('エラー', '登録する予定がありません');
      return;
    }

    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('エラー', 'カレンダーへのアクセス許可が必要です');
        return;
      }

      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const defaultCalendar = calendars.find((cal) => cal.isPrimary) || calendars[0];

      if (!defaultCalendar) {
        Alert.alert('エラー', 'カレンダーが見つかりません');
        return;
      }

      let successCount = 0;
      for (const shift of shifts) {
        try {
          const startDate = new Date(`${shift.date}T${shift.startTime}:00`);
          const endDate = new Date(`${shift.date}T${shift.endTime}:00`);

          await Calendar.createEventAsync(defaultCalendar.id, {
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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ラクラクカレンダー</Text>
        <Text style={styles.subtitle}>シフト表を撮影して自動登録</Text>
      </View>

      {!image && !editing && (
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={pickImage}>
            <Text style={styles.buttonText}>📁 ギャラリーから選択</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={takePhoto}>
            <Text style={styles.buttonText}>📷 カメラで撮影</Text>
          </TouchableOpacity>
        </View>
      )}

      {image && !editing && (
        <View style={styles.imageContainer}>
          <Image source={{ uri: image.uri }} style={styles.image} />
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Geminiが解析中...</Text>
            </View>
          )}
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
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => deleteShift(shift.id)}
              >
                <Text style={styles.deleteButtonText}>削除</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.addButton} onPress={addToCalendar}>
            <Text style={styles.addButtonText}>カレンダーに登録</Text>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 40,
    paddingTop: 60,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  buttonContainer: {
    padding: 20,
    gap: 15,
  },
  button: {
    backgroundColor: '#007AFF',
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
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    margin: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  shiftsContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
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
  },
  input: {
    backgroundColor: '#F8F8F8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
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
    backgroundColor: '#FF3B30',
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
    backgroundColor: '#34C759',
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
    borderColor: '#E0E0E0',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
});
