const searchButton = document.getElementById('searchButton');

// ボタンのクリックが機能しているかテストする
searchButton.addEventListener('click', () => {
    alert("ボタンがクリックされました！");
    console.log("検索ボタンのクリックイベントが発火しました。");
});
