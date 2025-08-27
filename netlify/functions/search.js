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
const model = genAI.getGenerativeModel({ model: "/gemini-2.0-flash", safetySettings });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  try {
    const { userQuery, type } = JSON.parse(event.body);
    let responseData = {};

    if (type === 'dmm') {
        responseData = await generateDmmResults(userQuery);
    } else if (type === 'sokmil') {
        responseData = await searchSokmil(userQuery);
    } else {
        throw new Error('無効な検索タイプです。');
    }

    if (!responseData.results || responseData.results.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ message: "作品が見つかりませんでした。" }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(responseData), // ★★★ キーワードも含まれたオブジェクトを返す ★★★
    };

  } catch (error) {
    console.error("Handler Error:", error);
    return { 
        statusCode: 500, 
        body: JSON.stringify({ error: `An error occurred: ${error.message}` })
    };
  }
};

async function searchSokmil(keyword) {
    try {
        const searchQuery = keyword || "新人";
        const keywordPrompt = `あなたは非常に優秀なAV作品の検索エンジンです。以下の文章から検索に使う日本語の名詞または形容詞を1~5つまで抽出し、スペース区切りで出力してください。文章: "${searchQuery}"`;
        const keywordResult = await model.generateContent(keywordPrompt);
        const refinedKeywords = keywordResult.response.text().trim().split(' ').filter(kw => kw);

        if (refinedKeywords.length === 0) return { results: [], keywords: [] };

        const searchPromises = refinedKeywords.map(async (kw) => {
            try {
                const params = new URLSearchParams({ /* ... params ... */ });
                const response = await fetch(`https://sokmil-ad.com/api/v1/Item?${params.toString()}`);
                if (!response.ok) return [];
                const data = await response.json();
                return data.result?.items || [];
            } catch { return []; }
        });
        
        const allResults = await Promise.all(searchPromises);
        const flattenedResults = allResults.flat();
        if (flattenedResults.length === 0) return { results: [], keywords: refinedKeywords };

        const frequencyCounter = new Map();
        const productData = new Map();
        flattenedResults.forEach(item => {
            const currentCount = frequencyCounter.get(item.item_id) || 0;
            frequencyCounter.set(item.item_id, currentCount + 1);
            if (!productData.has(item.item_id)) productData.set(item.item_id, item);
        });

        const sortedByFrequency = [...frequencyCounter.entries()].sort((a, b) => b[1] - a[1]);
        
        const finalResults = sortedByFrequency.map(([itemId, count]) => {
            const item = productData.get(itemId);
            return {
                id: item.item_id, site: 'ソクミル', title: item.title, url: item.affiliateURL,
                imageUrl: item.imageURL.list, maker: item.iteminfo.maker ? item.iteminfo.maker[0].name : '情報なし',
                score: `${count}/${refinedKeywords.length}`,
                reason: `AIが生成したキーワードのうち、${count}個に一致しました。`
            };
        });

        return { results: finalResults, keywords: refinedKeywords }; // ★★★ キーワードも一緒に返す ★★★

    } catch (e) { 
        console.error("Sokmil search failed:", e);
        throw new Error(`ソクミル検索中にエラーが発生しました: ${e.message}`);
    }
}

async function generateDmmResults(userQuery) {
    try {
        const queryForAI = userQuery || "還暦を迎えた熟女とねっとり";
        const prompt = `以下の記憶を元に、それに合致しそうな架空のDMM作品のリストを3つ生成してください。記憶: "${queryForAI}" 出力ルール: JSON配列形式で、各作品に以下のキーを含めてください: id, site, title, url, imageUrl, maker, score, reason`;
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        if (!responseText) return { results: [], keywords: [queryForAI] };
        
        const finalResults = JSON.parse(responseText.trim().replace(/```json/g, '').replace(/```/g, ''));
        return { results: finalResults, keywords: [queryForAI] }; // ★★★ キーワードも一緒に返す ★★★

    } catch (e) {
        console.error("DMM AI generation failed:", e);
        throw new Error(`DMMのAI生成中にエラーが発生しました: ${e.message}`);
    }
}
