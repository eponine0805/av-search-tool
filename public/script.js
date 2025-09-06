document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const dmmSearchButton = document.getElementById('dmmSearchButton');
    const sokmilSearchButton = document.getElementById('sokmilSearchButton');
    const loader = document.getElementById('loader');
    const resultsContainer = document.getElementById('results');

    // ▼▼▼ ここから追加 ▼▼▼

    // --- モーダル機能の実装 ---

    // 1. モーダル用のHTML要素を動的に作成してページに追加
    const modal = document.createElement('div');
    modal.id = 'imageModal';
    modal.className = 'modal';
    modal.innerHTML = '<img class="modal-content" id="modalImage">';
    document.body.appendChild(modal);

    const modalImage = document.getElementById('modalImage');

    // 2. モーダル用のCSSを動的に作成してページに追加
    const style = document.createElement('style');
    style.innerHTML = `
        .modal {
            display: none; /* 初期状態では非表示 */
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0,0,0,0.8);
            justify-content: center;
            align-items: center;
        }
        .modal-content {
            margin: auto;
            display: block;
            max-width: 90%;
            max-height: 90%;
        }
        .item img {
            cursor: pointer; /* クリックできることを示すカーソル */
            transition: transform 0.2s;
        }
        .item img:hover {
            transform: scale(1.05); /* マウスオーバーで少し拡大 */
        }
    `;
    document.head.appendChild(style);

    // 3. 画像がクリックされたときのイベントを設定 (イベント委任)
    resultsContainer.addEventListener('click', (event) => {
        // クリックされたのが、data-large-src属性を持つ画像の場合のみ処理
        if (event.target.tagName === 'IMG' && event.target.dataset.largeSrc) {
            modal.style.display = 'flex'; // モーダルを表示
            modalImage.src = event.target.dataset.largeSrc; // クリックされた画像の大きい画像URLを設定
        }
    });

    // 4. モーダル自体がクリックされたら非表示にする
    modal.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // ▲▲▲ ここまで追加 ▲▲▲

    dmmSearchButton.addEventListener('click', () => {
        performSearch('dmm');
    });

    sokmilSearchButton.addEventListener('click', () => {
        performSearch('sokmil');
    });

    const performSearch = async (searchType) => {
        const query = searchInput.value.trim();
        loader.style.display = 'block';
        resultsContainer.innerHTML = '';
        dmmSearchButton.disabled = true;
        sokmilSearchButton.disabled = true;
        try {
            const response = await fetch('/.netlify/functions/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userQuery: query, type: searchType }),
            });
            if (!response.ok) {
                throw new Error(`サーバーエラー: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            displayResults(data);
        } catch (error) {
            resultsContainer.innerHTML = `<p>エラーが発生しました: ${error.message}</p>`;
        } finally {
            loader.style.display = 'none';
            dmmSearchButton.disabled = false;
            sokmilSearchButton.disabled = false;
        }
    };
    
    function displayResults(data) {
        resultsContainer.innerHTML = '';
        const results = data.results;
        const keywords = data.keywords;
        const message = data.message;

        if (keywords && keywords.length > 0) {
            const keywordsElement = document.createElement('p');
            keywordsElement.className = 'keywords-info';
            keywordsElement.innerHTML = `<strong>抽出したキーワード:</strong> ${keywords.join(', ')}`;
            resultsContainer.appendChild(keywordsElement);
        }

        if (results && results.length > 0) {
            results.forEach(item => {
                const title = item.title || 'タイトルなし';
                const affiliateURL = item.url || '#';
                const imageURL = item.imageUrl || 'https://via.placeholder.com/200x300.png?text=No+Image';
                // ▼▼▼ 追加 ▼▼▼
                const largeImageURL = item.largeImageUrl || imageURL; // 大きい画像のURLを取得
                
                const maker = item.maker || '情報なし';
                const siteName = item.site || '';
                const score = item.score || '評価なし';
                const reason = item.reason || '評価理由なし';
                const actors = item.actors || '情報なし';
                const genres = item.genres || '情報なし';
                
                const itemElement = document.createElement('div');
                itemElement.className = 'item';

                // ▼▼▼ 修正: imgタグにdata属性で大きい画像のURLを持たせる ▼▼▼
                itemElement.innerHTML = `
                    <img src="${imageURL}" alt="${title}" data-large-src="${largeImageURL}">
                    <div class="item-info">
                        <h3><a href="${affiliateURL}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
                        <p><strong>サイト:</strong> ${siteName}</p>
                        <p><strong>メーカー:</strong> ${maker}</p>
                        <p><strong>出演者:</strong> ${actors}</p>
                        <p><strong>ジャンル:</strong> ${genres}</p>
                        <p class="score">一致度: ${score}</p>
                        <p><strong>評価理由:</strong> ${reason}</p>
                    </div>
                `;
                resultsContainer.appendChild(itemElement);
            });
        } else {
            const messageElement = document.createElement('p');
            messageElement.textContent = message || '一致する作品が見つかりませんでした。';
            resultsContainer.appendChild(messageElement);
        }
    }
});
