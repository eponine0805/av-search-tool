// netlify/functions/search.js

const { GoogleGenerativeAI } = require("@google/generative-ai");

// APIキーを環境変数から取得
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;

// Geminiモデルを初期化
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  // APIキーが設定されていない場合のエラーハンドリング
  if (!GEMINI_API_KEY) {
    return {
        statusCode: 500,
        body: JSON.stringify({ message: 'サーバーエラー: Gemini APIキーが設定されていません。' })
    };
  }

  try {
    const { userQuery } = JSON.parse(event.body);
    if (!userQuery) {
      return { statusCode: 400, body: 'Query is missing' };
    }

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
          "iteminfo": { "actress": [{"name": "架空 愛子"}] },
          "score": 98, "reason": "「OL」と「出張」の要素が完全に一致します。"
        }
      ]
    `;
    
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
    const finalResults = JSON.parse(responseText);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalResults),
    };

  } catch (error) {
    console.error(error);
    return { 
        statusCode: 500, 
        body: JSON.stringify({ error: `An error occurred: ${error.message}` })
    };
  }
};