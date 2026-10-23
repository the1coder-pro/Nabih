function renderReadingTime(article) {
  if (!article) {
    console.warn("لم يتم العثور على عنصر article في هذه الصفحة.");
    return;
  }

  // للتأكد من نجاح التعديل
  article.innerText = "HIII :)";
  console.log("تم تعديل المحتوى بنجاح!");
}

// البحث عن article أو الحاويات الشائعة للمقالات
const targetArticle = 
  document.querySelector("article") || 
  document.querySelector("main") || 
  document.querySelector(".post-content");

renderReadingTime(targetArticle);