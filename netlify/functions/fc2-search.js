// FC2のDeveloper IDとSecretを環境変数から取得
const DEV_ID = process.env.FC2_DEV_ID;
const DEV_SECRET = process.env.FC2_DEV_SECRET;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!DEV_ID || !DEV_SECRET) {
    return {
        statusCode: 500,
        body: JSON.stringify({ message: 'サーバーエラー: FC2 APIキーが設定されていません。' })
    };
  }

  try {
    const { userQuery } = JSON.parse(event.body);
    if (!userQuery) {
      return { statusCode: 400, body: 'Query is missing' };
    }

    // FC2 Search APIのエンドポイント
    const apiUrl = 'https://live.fc2.com/api/search.fc2';
    
    // APIに送るパラメータ
    const params = new URLSearchParams({
        version: '2.0',
        type: 'channel',
        devid: DEV_ID,
        devkey: DEV_SECRET,
        keyword: userQuery,
        limit: 20 // 取得件数
    });

    const response = await fetch(`${apiUrl}?${params.toString()}`);

    if (!response.ok) {
        throw new Error(`FC2 APIへのアクセスに失敗しました: ${response.statusText}`);
    }

    const results = await response.json();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results.channel || []), // channelの結果だけを返す
    };

  } catch (error) {
    console.error(error);
    return { 
        statusCode: 500, 
        body: JSON.stringify({ error: `An error occurred: ${error.message}` })
    };
  }
};
