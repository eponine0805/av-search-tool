document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const dmmSearchButton = document.getElementById('dmmSearchButton');
    const sokmilSearchButton = document.getElementById('sokmilSearchButton');
    const loader = document.getElementById('loader');
    const resultsContainer = document.getElementById('results');

    dmmSearchButton.addEventListener('click', () => {
        performSearch('dmm');
    });

    sokmilSearchButton.addEventListener('click', () => {
        performSearch('sokmil');
    });

    const performSearch = async (searchType) => {
        // ★★★ 空白チェックを削除 ★★★
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

            const results = await response.json();
            displayResults(results);

        } catch (error) {
            resultsContainer.innerHTML = `<p>エラーが発生しました: ${error.message}</p>`;
        } finally {
            loader.style.display = 'none';
            dmmSearchButton.disabled = false;
            sokmilSearchButton.disabled = false;
        }
    };
    
    // (displayResults関数は変更なし)
    function displayResults(results) {
        // ... (以下、変更なし) ...
    }
});
