// netlify/functions/search.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const SOKMIL_API_KEY = process.env.SOKMIL_API_KEY;

// ★★★ 安全設定を調整したモデルを初期化 ★★★
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", safetySettings });


exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  try {
    const { userQuery, type } = JSON.parse(event.body);
    let finalResults = [];

    if (type === 'dmm') {
        finalResults = await generateDmmResults(userQuery);
    } else if (type === 'sokmil') {
        finalResults = await searchSokmil(userQuery);
    } else {
        throw new Error('無効な検索タイプです。');
    }

    if (finalResults.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ message: "作品が見つかりませんでした。AIの安全フィルターによりブロックされた可能性があります。" }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalResults),
    };

  } catch (error) {
    console.error("Handler Error:", error);
    return { 
        statusCode: 500, 
        body: JSON.stringify({ message: `エラーが発生しました: ${error.message}` })
    };
  }
};

async function searchSokmil(keyword) {
    // 空欄の場合はデフォルトキーワードを設定
    const searchQuery = keyword || "新人";
    try {
        const params = new URLSearchParams({
            api_key: SOKMIL_API_KEY,
            keyword: searchQuery,
            count: 10
        });
        const response = await fetch(`https://sokmil.com/api/search?${params.toString()}`);
        if (!response.ok) throw new Error("Sokmil API request failed");
        const data = await response.json();
        
        if (!data.items || data.items.length === 0) return [];

        const prompt = `ユーザーの記憶とソクミルの作品リストを比較し、各作品に一致度(score)と理由(reason)を追加したJSON配列で出力してください。記憶: "${searchQuery}" 作品リスト: ${JSON.stringify(data.items)} 出力形式: JSON配列のみ`;
        const result = await model.generateContent(prompt);
        // ★★★ AIがブロックした場合の応答を考慮 ★★★
        const responseText = result.response.text();
        if (!responseText) return [];
        const rankedItems = JSON.parse(responseText.trim().replace(/```json/g, '').replace(/```/g, ''));

        return rankedItems.map(rankedItem => {
            const originalItem = data.items.find(p => p.id === rankedItem.id);
            if (!originalItem) return null;
            return {
                id: originalItem.id, site: 'ソクミル', title: originalItem.title, url: originalItem.url,
                imageUrl: originalItem.thumb, maker: originalItem.maker_name,
                score: rankedItem.score, reason: rankedItem.reason
            };
        }).filter(item => item !== null);

    } catch (e) { 
        // エラーをコンソールに出力して調査しやすくする
        console.error("Sokmil search failed:", e);
        // フロントエンドにエラーを伝える
        throw new Error(`ソクミル検索中にエラーが発生しました: ${e.message}`);
    }
}

async function generateDmmResults(userQuery) {
    const queryForAI = userQuery || "還暦を迎えた熟女とねっとり";
    try {
        const prompt = `以下の記憶を元に、それに合致しそうな架空のDMM作品のリストを3つ生成してください。記憶: "${queryForAI}" 出力ルール: JSON配列形式で、各作品に以下のキーを含めてください: id, site, title, url, imageUrl, maker, score, reason`;
        const result = await model.generateContent(prompt);
        // ★★★ AIがブロックした場合の応答を考慮 ★★★
        const responseText = result.response.text();
        if (!responseText) return [];
        return JSON.parse(responseText.trim().replace(/```json/g, '').replace(/```/g, ''));
    } catch (e) {
        // エラーをコンソールに出力して調査しやすくする
        console.error("DMM AI generation failed:", e);
        // フロントエンドにエラーを伝える
        throw new Error(`DMMのAI生成中にエラーが発生しました: ${e.message}`);
    }
}
