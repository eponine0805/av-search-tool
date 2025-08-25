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
    const { userQuery, type } = JSON.parse(event.body);
    if (!userQuery) {
      return { statusCode: 400, body: 'Query is missing' };
    }

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

// --- ソクミル検索用の関数 (AI評価なしの安全なバージョン) ---
async function searchSokmil(keyword) {
    try {
        const params = new URLSearchParams({
            api_key: SOKMIL_API_KEY,
            keyword: keyword,
            count: 20
        });
        const response = await fetch(`https://sokmil.com/api/search?${params.toString()}`);
        if (!response.ok) return [];
        const data = await response.json();
        
        return (data.items || []).map(item => ({
            id: item.id,
            site: 'ソクミル',
            title: item.title,
            url: item.url,
            imageUrl: item.thumb,
            maker: item.maker_name,
            score: 'N/A',
            reason: 'キーワードに一致した作品'
        }));
    } catch (e) { return []; }
}

// --- DMM(AI生成)用の関数 (以前のブロックされないプロンプトに戻す) ---
async function generateDmmResults(userQuery) {
    try {
        // ★★★ このプロンプトを以前のバージョンに戻しました ★★★
        const prompt = `
          以下のユーザーの曖昧な記憶を元に、それに合致しそうな架空のDMM作品のリストを3つ生成してください。
          # ユーザーの記憶: "${userQuery}"
          # 出力ルール: JSON配列形式で、各作品に以下のキーを含めてください: id, site, title, url, imageUrl, maker, score, reason
        `;
        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim().replace(/```json/g, '').replace(/```g, '');
        return JSON.parse(responseText);
    } catch (e) { return []; }
}
