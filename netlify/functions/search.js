// netlify/functions/search.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const SOKMIL_API_KEY = process.env.SOKMIL_API_KEY;
// ★★★ Netlifyの環境変数に、あなたのソクミルアフィリエイトIDを追加してください ★★★
const SOKMIL_AFFILIATE_ID = process.env.SOKMIL_AFFILIATE_ID; 

// 安全設定を調整したモデルを初期化
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
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
        if (!GEMINI_API_KEY) throw new Error('Gemini APIキーが設定されていません。');
        finalResults = await generateDmmResults(userQuery);
    } else if (type === 'sokmil') {
        if (!SOKMIL_API_KEY || !SOKMIL_AFFILIATE_ID) throw new Error('Sokmil APIキーまたはアフィリエイトIDが設定されていません。');
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
            affiliate_id: SOKMIL_AFFILIATE_ID,
            output: 'json',
            hits: 15,
            keyword: searchQuery,
        });
        const response = await fetch(`https://sokmil-ad.com/api/v1/item?${params.toString()}`);
        if (!response.ok) throw new Error(`Sokmil API request failed: ${response.statusText}`);
        const data = await response.json();
        
        if (!data.result || !data.result.items || data.result.items.length === 0) return [];

        // データを共通の形式に変換
        const products = data.result.items.map(item => ({
            id: item.item_id,
            site: 'ソクミル',
            title: item.title,
            url: item.affiliateURL,
            imageUrl: item.imageURL.list,
            maker: item.iteminfo.maker ? item.iteminfo.maker[0].name : '情報なし',
        }));

        // AIに評価を依頼
        const prompt = `ユーザーの記憶とソクミルの作品リストを比較し、各作品に一致度(score)と理由(reason)を追加したJSON配列で出力してください。
        # ユーザーの記憶: "${searchQuery}"
        # 作品リスト: ${JSON.stringify(products)}
        # 出力形式 (JSON配列のみ): [{ "id": "作品ID", "score": 90, "reason": "理由" }]`;
        
        const rankingResult = await model.generateContent(prompt);
        const responseText = rankingResult.response.text();
        if (!responseText) return products; // AIがブロックされた場合は、評価なしのリストを返す
        
        const rankedItems = JSON.parse(responseText.trim().replace(/```json/g, '').replace(/```/g, ''));
        
        return rankedItems.map(rankedItem => {
            const originalItem = products.find(p => p.id === rankedItem.id);
            if (!originalItem) return null;
            return {
                ...originalItem,
                score: rankedItem.score,
                reason: rankedItem.reason
            };
        }).filter(item => item !== null);

    } catch (e) { 
        console.error("Sokmil search failed:", e);
        throw new Error(`ソクミル検索中にエラーが発生しました: ${e.message}`);
    }
}

// --- DMM(AI生成)用の関数 ---
async function generateDmmResults(userQuery) {
    try {
        const queryForAI = userQuery || "還暦を迎えた熟女とねっとり";
        // ★★★ ソクミルとデータ形式を合わせるように指示を修正 ★★★
        const prompt = `
          以下のユーザーの記憶を元に、それに合致しそうな架空のDMM作品のリストを3つ生成してください。
          # ユーザーの記憶: "${queryForAI}"
          # 出力ルール: 
          - 必ずJSON配列形式で出力してください。
          - 各作品には以下のキーを含めてください: id, site, title, url, imageUrl, maker, score, reason
          - 'site'は必ず "DMM (AI生成)" としてください。
        `;
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        if (!responseText) return [];
        return JSON.parse(responseText.trim().replace(/```json/g, '').replace(/```/g, ''));
    } catch (e) { 
        console.error("DMM AI generation failed:", e);
        throw new Error(`DMMのAI生成中にエラーが発生しました: ${e.message}`);
    }
}
