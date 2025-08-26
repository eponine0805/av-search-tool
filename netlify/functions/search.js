// netlify/functions/search.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const SOKMIL_API_KEY = process.env.SOKMIL_API_KEY;
const SOKMIL_AFFILIATE_ID = process.env.SOKMIL_AFFILIATE_ID; 

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
        finalResults = await generateDmmResults(userQuery);
    } else if (type === 'sokmil') {
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
    console.error("Handler Error:", error);
    return { 
        statusCode: 500, 
        body: JSON.stringify({ error: `An error occurred: ${error.message}` })
    };
  }
};

// --- ソクミル検索用の関数 (クラッシュ時の再検索機能を追加) ---
async function searchSokmil(keyword) {
    const searchQuery = keyword || "新人";
    let refinedKeywords = '';
    let data = null;
    let attempt = 1;

    try {
        // --- 試行1回目 ---
        console.log("Attempting search (Attempt 1)...");
        const keywordPrompt1 = `あなたは非常に優秀なAV作品の検索エンジンです。以下のユーザーの曖昧な記憶から、作品検索に使う日本語の名詞または形容詞を最大3つまで生成し、スペース区切りで出力してください。ユーザーの曖昧な記憶: "${searchQuery}"`;
        const keywordResult1 = await model.generateContent(keywordPrompt1);
        refinedKeywords = keywordResult1.response.text().trim();

        const params1 = new URLSearchParams({
            api_key: SOKMIL_API_KEY,
            affiliate_id: SOKMIL_AFFILIATE_ID,
            output: 'json',
            hits: 20,
            keyword: refinedKeywords,
        });
        const response1 = await fetch(`https://sokmil-ad.com/api/v1/Item?${params1.toString()}`);
        if (!response1.ok) {
            // サーバーエラーの場合は、エラーを投げてcatchブロックで再試行させる
            throw new Error(`Sokmil API request failed: ${response1.status} ${response1.statusText}`);
        }
        data = await response1.json();

    } catch (e) {
        console.error("Search Attempt 1 failed:", e);
        // 1回目の試行が失敗した場合は、エラーを握りつぶして2回目の試行に進む
        data = null; 
    }

    // --- クラッシュした場合や、1回目で見つからなかった場合に再検索 ---
    if (!data || !data.result || !data.result.items || data.result.items.length === 0) {
        try {
            attempt = 2;
            console.log(`Attempt 1 failed or found no results. Retrying (Attempt 2)...`);
            
            const keywordPrompt2 = `「${searchQuery}」というテーマで、より一般的で検索ヒットしやすい別のキーワードを3つ、スペース区切りで出力してください。`;
            const keywordResult2 = await model.generateContent(keywordPrompt2);
            refinedKeywords = keywordResult2.response.text().trim();
            
            const params2 = new URLSearchParams({
                api_key: SOKMIL_API_KEY,
                affiliate_id: SOKMIL_AFFILIATE_ID,
                output: 'json',
                hits: 20,
                keyword: refinedKeywords,
            });
            const response2 = await fetch(`https://sokmil-ad.com/api/v1/item?${params2.toString()}`);
            if (!response2.ok) throw new Error(`Sokmil API retry request failed: ${response2.statusText}`);
            data = await response2.json();

        } catch (e) {
            // 2回目も失敗した場合は、最終的なエラーとして処理する
            console.error("Search Attempt 2 also failed:", e);
            throw new Error(`検索と再試行の両方に失敗しました: ${e.message}`);
        }
    }
    
    if (!data || !data.result || !data.result.items || data.result.items.length === 0) return [];

    return data.result.items.map(item => ({
        id: item.item_id,
        site: 'ソクミル',
        title: item.title,
        url: item.affiliateURL,
        imageUrl: item.imageURL.list,
        maker: item.iteminfo.maker ? item.iteminfo.maker[0].name : '情報なし',
        score: 'N/A',
        reason: `(試行${attempt}回目) AIキーワード「${refinedKeywords}」に一致`
    }));
}
// --- DMM(AI生成)用の関数 ---
async function generateDmmResults(userQuery) {
    try {
        const queryForAI = userQuery || "還暦を迎えた熟女とねっとり";
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
