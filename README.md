

<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pour mon bébé ❤️</title>
<style>
*{box-sizing:border-box}
body{
 margin:0;min-height:100vh;
 font-family:Arial,sans-serif;
 color:#fff;text-align:center;
 background:linear-gradient(145deg,#240d25,#6d2049,#bd5277);
}
header{padding:65px 18px 30px}
h1{font-size:clamp(35px,9vw,60px);margin:15px 0}
.subtitle{font-size:18px;line-height:1.7}
.heart{font-size:75px;animation:pulse 1.5s infinite}
@keyframes pulse{50%{transform:scale(1.15)}}
.choices{display:flex;gap:16px;justify-content:center;
 flex-wrap:wrap;padding:20px}
.choice{
 width:min(42%,190px);min-width:140px;
 padding:25px 12px;border:1px solid #ffffff55;
 border-radius:22px;background:#ffffff18;color:white;
 font-size:18px;cursor:pointer;
}
.choice span{display:block;font-size:52px;margin-bottom:12px}
#message{
 display:none;margin:20px auto;padding:25px;
 width:90%;max-width:520px;background:#fff1f6;
 color:#61213f;border-radius:22px;line-height:1.9;
 font-size:18px;
}
button:focus{outline:2px solid white}
footer{padding:30px 15px;color:#ffe0ec}
</style>
</head>
<body>
<header>
 <div class="heart">❤️</div>
 <h1>Je t'aime mon bébé</h1>
 <p class="subtitle">
  J'ai préparé un petit endroit rien que pour nous deux.<br>
  Choisis une porte et découvre ce qu'il y a dans mon cœur.
 </p>
</header>

<div class="choices">
 <button class="choice" onclick="ouvrir('coeur')">
  <span>❤️</span>Le cœur
 </button>
 <button class="choice" onclick="ouvrir('cerveau')">
  <span>🧠</span>Le cerveau
 </button>
</div>

<div id="message"></div>

<footer>
 Fait avec tout mon amour, pour toi ❤️
</footer>

<script>
function ouvrir(type){
 const m=document.getElementById('message');
 m.style.display='block';
 if(type==='coeur'){
  m.innerHTML=`
  <h2>❤️ Tout l'amour que j'ai pour toi</h2>
  💋 Les bisous que je veux te donner.<br>
  🫂 Les câlins dans lesquels je veux rester.<br>
  🥰 Les petites attentions et les gâtés.<br>
  💞 Ta main dans la mienne.<br>
  😘 Les moments où je te serre contre moi.<br><br>
  <strong>Mon cœur te choisit, encore et encore.</strong>`;
 }else{
  m.innerHTML=`
  <h2>🧠 Tout ce que je veux vivre avec toi</h2>
  🤍 Ta présence, même dans les jours difficiles.<br>
  🏡 Être ensemble, partager notre quotidien.<br>
  😂 Faire des conneries et rire comme deux idiots.<br>
  🫶 Se soutenir et se comprendre.<br>
  🌍 Créer nos souvenirs et nos petits délires.<br><br>
  <strong>Je ne veux pas seulement t'aimer : je veux vivre plein de choses avec toi.</strong>`;
 }
 m.scrollIntoView({behavior:'smooth',block:'center'});
}
</script>
</body>
</html>
