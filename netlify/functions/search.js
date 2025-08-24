// ファイルパス: netlify/functions/search.js

import { GoogleGenerativeAI } from "@google/generative-ai";

// APIキーを環境変数から取得
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);

// export const handler と正しく記述します。
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'サーバーエラー: Gemini APIキーが設定されていません。' })
    };
  }
  

  try {
    const { userQuery } = JSON.parse(event.body);
    if (!userQuery) {
      throw new Error("クエリがありません。");
    }

    // JSON出力を強制する設定を追加
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const prompt = `
      あなたは非常に優秀なAV作品の検索エンジンです。
      以下のユーザーの曖昧な記憶を元に、それに合致しそうな架空のAV作品のリストを3つ生成してください。
      
      # ユーザーの記憶:
      "${userQuery}"
      
      # 出力ルール:
      - 必ずJSON配列形式で出力してください。
      - 各作品には以下のキーを含めてください: title, affiliateURL, imageURL, iteminfo, score, reason
      - 'title': 記憶に沿った架空の作品タイトルを創作してください。
      - 'affiliateURL': "#" という固定文字列にしてください。
      - 'imageURL': { "large": "https://via.placeholder.com/200x300.png?text=Generated+Image" } という固定のオブジェクトにしてください。
      - 'iteminfo': { "actress": [{"name": "架空の女優名"}] } という形式で、架空の女優名を創作してください。
      - 'score': ユーザーの記憶との一致度を0〜100の数値で評価してください。
      - 'reason': なぜその作品が一致すると考えたか、簡潔な理由を述べてください。
      
      # 出力形式 (JSON配列のみを出力):
      [
        {
          "title": "架空のタイトル1", "affiliateURL": "#",
          "imageURL": { "large": "https://via.placeholder.com/200x300.png?text=Generated+Image" },
          "iteminfo": { "actress": [{"name": "架空 花子"}] },
          "score": 98, "reason": "「OL」と「出張」の要素が完全に一致します。"
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const finalResults = JSON.parse(response.text());

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalResults),
    };

  } catch (error) {
    console.error("API Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};