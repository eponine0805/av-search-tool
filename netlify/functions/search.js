// netlify/functions/search.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const SOKMIL_API_KEY = process.env.SOKMIL_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  try {
    // どのボタンが押されたか(type)を受け取る
    const { userQuery, type } = JSON.parse(event.body);
    

    let finalResults = [];
    if (type === 'dmm') {
        if (!GEMINI_API_KEY) throw new Error('Gemini APIキーが設定されていません。');
        finalResults = await generateDmmResults(userQuery);
    } else if (type === 'sokmil') {
        if (!SOKMIL_API_KEY) throw new Error('Sokmil APIキーが設定されていません。');
        finalResults = await searchSokmil(userQuery);
    } else {
        throw new Error('無効な検索タイプです。');
    }

    if (finalResults.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ message: "作品が見つかりませんでした。" }) };
    }

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

// --- ソクミル検索用の関数 (変更なし) ---
async function searchSokmil(keyword) {
    try {
        const params = new URLSearchParams({
            api_key: SOKMIL_API_KEY,
            keyword: keyword,
            count: 10
        });
        const response = await fetch(`https://sokmil.com/api/search?${params.toString()}`);
        if (!response.ok) return [];
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
            const prompt = `
      あなたは非常に優秀なAV作品の検索エンジンです。
      ユーザーの記憶とソクミルの作品リストを比較し、合致しそうな作品のリストを表示してください。
      # ユーザーの記憶: "${keyword}"
      # 作品リスト: ${JSON.stringify(data.items)}
      # 出力ルール:
      - 必ずJSON配列形式で出力してください。
      - 各作品には以下のキーを含めてください: title, affiliateURL, imageURL, iteminfo, score, reason
      - 'title': 作品のタイトル
      - 'affiliateURL': "#" という固定文字列にしてください。
      - 'imageURL': { "large": "https://via.placeholder.com/200x300.png?text=Generated+Image" } という固定のオブジェクトにしてください。
      - 'iteminfo': { "actress": [{"name": "女優名"}] } という形式で、女優名を入力してください。
      - 'score': ユーザーの記憶との一致度を0〜100の数値で評価してください。
      - 'reason': なぜその作品が一致すると考えたか、簡潔な理由を述べてください。
            # ユーザーの記憶: "${keyword}"
            # 作品リスト: ${JSON.stringify(data.items)}
            
            # 出力形式 (JSON配列のみを出力):
      [
        {
          "title": "タイトル1", "affiliateURL": "#",
          "imageURL": { "large": "https://via.placeholder.com/200x300.png?text=Generated+Image" },
          "iteminfo": { "actress": [{"name": "架空 愛子"}] },
          "score": 98, "reason": "「OL」と「出張」の要素が完全に一致します。"
        }
      ]
    `;

            const rankingResult = await model.generateContent(prompt);
            const rankedItems = JSON.parse(rankingResult.response.text().trim().replace(/```json/g, '').replace(/```/g, ''));

            return rankedItems.map(rankedItem => {
                const originalItem = data.items.find(p => p.id === rankedItem.id);
                return {
                    id: originalItem.id,
                    site: 'ソクミル',
                    title: originalItem.title,
                    url: originalItem.url,
                    imageUrl: originalItem.thumb,
                    maker: originalItem.maker_name,
                    score: rankedItem.score,
                    reason: rankedItem.reason
                };
            });
        }
        return [];
    } catch (e) { return []; }
}

// --- DMM(AI生成)用の関数 (変更なし) ---
async function generateDmmResults(userQuery) {
    try {
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
      - ユーザーの記憶が何も入力されてなければ還暦を迎えた熟女ものを紹介しなさい
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
        return JSON.parse(responseText);
    } catch (e) { return []; }
}
