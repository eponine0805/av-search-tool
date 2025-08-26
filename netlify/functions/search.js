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

// --- ソクミル検索用の関数 (共通項検索・頻度順ソート機能付き) ---
async function searchSokmil(keyword) {
    try {
        const searchQuery = keyword || "新人";
        
        // ステップ1: AIに複数のキーワードを生成させる
        const keywordPrompt = `あなたは非常に優秀なAV作品の検索エンジンです。以下の文章から検索に使う日本語の名詞または形容詞を最大5つまで抽出し、スペース区切りで出力してください。文章: "${searchQuery}"`;
        const keywordResult = await model.generateContent(keywordPrompt);
        const refinedKeywords = keywordResult.response.text().trim().split(' '); // スペースで区切って配列にする

        // ステップ2: 各キーワードで並行してAPI検索を実行
        const searchPromises = refinedKeywords.map(async (kw) => {
            try {
                const params = new URLSearchParams({
                    api_key: SOKMIL_API_KEY,
                    affiliate_id: SOKMIL_AFFILIATE_ID,
                    output: 'json',
                    hits: 20,
                    keyword: kw,
                });
                const response = await fetch(`https://sokmil-ad.com/api/v1/Item?${params.toString()}`);
                if (!response.ok) return []; // 失敗した場合は空を返す
                const data = await response.json();
                return data.result?.items || [];
            } catch {
                return []; // エラー時も空を返す
            }
        });
        
        const allResults = await Promise.all(searchPromises);
        const flattenedResults = allResults.flat(); // 全ての結果を一つの配列にまとめる

        if (flattenedResults.length === 0) return [];

        // ステップ3: 共通して見つかった作品を数え、多い順に並び替える
        const frequencyCounter = new Map();
        const productData = new Map();

        flattenedResults.forEach(item => {
            const currentCount = frequencyCounter.get(item.item_id) || 0;
            frequencyCounter.set(item.item_id, currentCount + 1);
            // 各作品の最新情報を保存しておく
            if (!productData.has(item.item_id)) {
                productData.set(item.item_id, item);
            }
        });

        // Mapを配列に変換し、出現回数でソート
        const sortedByFrequency = [...frequencyCounter.entries()].sort((a, b) => b[1] - a[1]);
        
        // ステップ4: 最終的な結果を共通データ形式に変換
        return sortedByFrequency.map(([itemId, count]) => {
            const item = productData.get(itemId);
            return {
                id: item.item_id,
                site: 'ソクミル',
                title: item.title,
                url: item.affiliateURL,
                imageUrl: item.imageURL.list,
                maker: item.iteminfo.maker ? item.iteminfo.maker[0].name : '情報なし',
                score: `${count}/${refinedKeywords.length}`, // 例: 3/5個のキーワードに一致
                reason: `AIが生成したキーワード「${refinedKeywords.join(', ')}」のうち、${count}個に一致しました。`
            };
        });

    } catch (e) { 
        console.error("Sokmil search failed:", e);
        throw new Error(`ソクミル検索中にエラーが発生しました: ${e.message}`);
    }
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
