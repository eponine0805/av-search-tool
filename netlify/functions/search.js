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

// --- ソクミル検索用の関数 ---
async function searchSokmil(keyword) {
    
    try {
        const params = new URLSearchParams({
            api_key: SOKMIL_API_KEY,
            affiliate_id: '46544', // ★★★ あなたのソクミルアフィリエイトIDに書き換えてください ★★★
            output: 'json',
            hits: 15,
            keyword: searchQuery,
        });
        // ★★★ APIのエンドポイントを修正 ★★★
        const response = await fetch(`https://sokmil-ad.com/api/v1/item?${params.toString()}`);
        if (!response.ok) throw new Error(`Sokmil API request failed: ${response.statusText}`);
        const data = await response.json();
        
        if (!data.result || !data.result.items || data.result.items.length === 0) return [];

        // ★★★ 共通のデータ形式に変換 ★★★
        return data.result.items.map(item => ({
            id: item.item_id,
            site: 'ソクミル',
            title: item.title,
            url: item.affiliateURL,
            imageUrl: item.imageURL.list,
            maker: item.iteminfo.maker ? item.iteminfo.maker[0].name : '情報なし',
            score: 'N/A',
            reason: 'キーワードに一致した作品'
        }));

    } catch (e) { 
        console.error("Sokmil search failed:", e);
        throw new Error(`ソクミル検索中にエラーが発生しました: ${e.message}`);
    }
}

// --- DMM(AI生成)用の関数 (変更なし) ---
async function generateDmmResults(userQuery) {
    try{
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
        return JSON.parse(responseText);
    } catch (e) { return []; }
}
