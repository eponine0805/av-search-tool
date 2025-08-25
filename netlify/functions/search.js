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
  
  if (!GEMINI_API_KEY || !SOKMIL_API_KEY) {
    return {
        statusCode: 500,
        body: JSON.stringify({ message: 'サーバーエラー: APIキーが設定されていません。' })
    };
  }

  try {
    const { userQuery } = JSON.parse(event.body);
    if (!userQuery) {
      return { statusCode: 400, body: 'Query is missing' };
    }

    // --- ソクミル検索とDMM(AI生成)を並行して実行 ---
    const [sokmilResults, dmmAiResults] = await Promise.all([
        searchSokmil(userQuery),
        generateDmmResults(userQuery)
    ]);

    // 両方の結果を結合
    const finalResults = [...sokmilResults, ...dmmAiResults];

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
        body: JSON.stringify({ error: `An error occurred: ${error.message}`, stack: error.stack })
    };
  }
};

// --- ソクミルAPI検索用の関数 ---
async function searchSokmil(keyword) {
    try {
        const params = new URLSearchParams({
            api_key: SOKMIL_API_KEY,
            keyword: keyword,
            count: 5
        });
        const response = await fetch(`https://sokmil.com/api/search?${params.toString()}`);
        if (!response.ok) return [];
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
            const prompt = `ユーザーの記憶とソクミルの作品リストを比較し、各作品に一致度(score)と理由(reason)を追加したJSON配列で出力してください。
            # ユーザーの記憶: "${keyword}"
            # 作品リスト: ${JSON.stringify(data.items)}
            # 出力形式 (JSON配列のみ): [{ "id": "作品ID", "score": 90, "reason": "理由" }]`;

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
    } catch (e) {
        console.error("Sokmil search failed:", e);
        return [];
    }
}

// --- DMM(AI生成)用の関数 ---
async function generateDmmResults(userQuery) {
    try {
        const prompt = `
          あなたはDMMの作品検索エンジンです。以下のユーザーの曖昧な記憶を元に、それに合致しそうな架空のDMM作品のリストを3つ生成してください。
          # ユーザーの記憶: "${userQuery}"
          # 出力ルール: JSON配列形式で、各作品に以下のキーを含めてください: id, site, title, url, imageUrl, maker, score, reason
        `;
        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
        return JSON.parse(responseText);
    } catch (e) {
        console.error("DMM AI generation failed:", e);
        return [];
    }
}
