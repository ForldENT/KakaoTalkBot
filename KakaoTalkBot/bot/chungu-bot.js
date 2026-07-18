/**
 * ============================================================
 *  춘구봇 — 카카오톡 오픈채팅 신입 온보딩 봇  (v2)
 * ------------------------------------------------------------
 *  플랫폼 : 메신저봇R (API2)   |   엔진 : Rhino (ES5)
 *
 *  v2 추가분
 *   1) /2 매력어필 진행 기준 + /3 얼공 여부 재확인
 *   2) 서버 닉 DB 연동(중복검사 강화, 서버 다운 시 로컬 폴백)
 *   3) 명령어 로직 : 로또/로또번호/가위바위보/뭐먹지/안녕
 *      + 규정 안내 텍스트(도인·맞공·보룸·얼·단타·하트·게임설명·신입질문·필수)
 *
 *  [설정] 아래 NICK_API / BOT_KEY 를 본인 서버 값으로 바꾸세요.
 *         서버를 아직 안 띄웠으면 USE_SERVER=false 로 두면 로컬만 동작.
 * ============================================================
 */

const bot = BotManager.getCurrentBot();

/* ===================== 설정 ===================== */
var BOT_TAG   = "[춘구봇]";

// ⚠️ 처음엔 false 로 두세요. 서버 없이 봇만으로 완전 동작합니다(무료).
//    나중에 Railway 등에 server.js 를 올리면 true 로 바꾸세요.
var USE_SERVER = false;                                  // 서버 닉 DB 사용 여부
var NICK_API   = "https://your-server.up.railway.app";   // ← 본인 서버 주소
var BOT_KEY    = "change-me";                             // ← 서버와 동일한 시크릿

var REGIONS = [
  "서울","부산","대구","인천","광주","대전","울산","세종",
  "경기","강원","충북","충남","전북","전남","경북","경남","제주",
  "수원","성남","용인","고양","화성","안산","안양","평택","김포","광명",
  "창원","김해","청주","천안","전주","포항","구미","경주","제천"
];

var ACK_DONE = ["완료했습니다","완료했어요","완료","다했어요","했어요","완료했어"];
var ACK_YES  = ["네","넵","예","yes"];
var ACK_WAIT = ["잠시만요","잠깐만요","기다려","잠시만","잠깐"];
var FACE_OK  = ["할게요","할래요","네","넵","예"];
var FACE_NO  = ["아니요","아니오","안할래","다음","스킵","패스"];

var RECENT_WINDOW_MS = 3 * 60 * 1000;   // 최근 3분
var CHARM_MIN_LEN    = 6;               // 매력어필 최소 실질 글자수

var FOODS = ["김치찌개","제육볶음","치킨","마라탕","돈까스","국밥","떡볶이",
             "초밥","파스타","냉면","순대국","비빔밥","라멘","쌀국수","햄버거","곱창", "★ 얼공이나 해라 ★",
            "삼겹살","샤브샤브","칼국수","족발","보쌈","피자","샌드위치","김밥","라면","오므라이스",
             "스테이크","탕수육","짬뽕","짜장면","쫄면","닭갈비","떡국","오징어볶음",
             "순두부찌개","김치볶음밥","닭볶음탕","갈비탕","콩나물국밥","해물파전","감자탕","쌈밥",
             "낙지볶음","오징어덮밥","카레라이스","샤오롱바오","마파두부","토마토스파게티",
             "크림스파게티","까르보나라","봉골레파스타","페퍼로니피자","콤비네이션피자",
             "불고기버거","치즈버거","새우버거","핫도그","프렌치프라이","치즈스틱", "♥ 굶기나 해라 ♥"];

/* ===================== 상태 저장 (메모리) ===================== */
var users        = {}; // "channelId|userHash" -> {stage, gender, nick, age, region}
var seenNicks    = {}; // channelId -> { nick : userHash }
var seenHashes   = {}; // channelId -> { userHash : true }
var recentChats  = {}; // channelId -> [ {name, hash, t} ]
var pendingGreet = {}; // channelId -> ts
var muted        = {}; // channelId -> bool (안내용, 강제력 없음)
var lottoSecret  = {}; // channelId -> 1~45

var STAGE = {
  NICK:"s1_nick", CHARM:"s2_charm",
  FACE_ASK:"s3_ask", FACE_PHOTO:"s3_photo", DONE:"done"
};

/* ===================== 유틸 ===================== */
function keyOf(c,h){ return c + "|" + h; }
function inList(text,list){ var t=text.trim(); for(var i=0;i<list.length;i++){ if(t===list[i]) return true; } return false; }
function containsAny(text,list){ for(var i=0;i<list.length;i++){ if(text.indexOf(list[i])!==-1) return true; } return false; }

function plus5Label(){ var d=new Date(); d.setDate(d.getDate()+5); return (d.getMonth()+1)+"월 "+d.getDate()+"일"; }

function pushRecent(c,name,hash){
  if(!recentChats[c]) recentChats[c]=[];
  recentChats[c].push({name:name,hash:hash,t:Date.now()});
  var now=Date.now(), a=recentChats[c], keep=[];
  for(var i=0;i<a.length;i++){ if(now-a[i].t<=RECENT_WINDOW_MS) keep.push(a[i]); }
  recentChats[c]=keep;
}

function recentTargets(c){
  var a=recentChats[c]||[], now=Date.now(), bears=[], rabbits=[], seen={};
  for(var i=a.length-1;i>=0;i--){
    if(now-a[i].t>RECENT_WINDOW_MS) continue;
    var nm=a[i].name; if(seen[nm]) continue; seen[nm]=true;
    if(nm.indexOf("🐻")!==-1) bears.push(nm);
    else if(nm.indexOf("🐰")!==-1) rabbits.push(nm);
  }
  var out="🐻 남자\n"+(bears.length?" - "+bears.join("\n - "):" (최근 활동 없음)");
  out+="\n\n🐰 여자\n"+(rabbits.length?" - "+rabbits.join("\n - "):" (최근 활동 없음)");
  return out;
}

/* ===================== 서버 닉 DB 연동 ===================== */
function httpPost(url,obj){
  var Jsoup=org.jsoup.Jsoup, Method=org.jsoup.Connection.Method;
  return Jsoup.connect(url).ignoreContentType(true)
    .header("Content-Type","application/json")
    .header("X-Bot-Key",BOT_KEY)
    .requestBody(JSON.stringify(obj))
    .method(Method.POST).timeout(8000).execute().body();
}
// 반환: true(사용가능) / false(중복) / null(서버 불가 → 폴백)
function serverNickCheck(c,nick,hash){
  if(!USE_SERVER) return null;
  try{ return JSON.parse(httpPost(NICK_API+"/nick/check",{channelId:c,nick:nick,hash:hash})).available===true; }
  catch(e){ return null; }
}
function serverNickRegister(c,nick,hash,g,age,region){
  if(!USE_SERVER) return;
  try{ httpPost(NICK_API+"/nick/register",{channelId:c,nick:nick,hash:hash,gender:g,age:age,region:region}); }
  catch(e){}
}

/* ===================== 검증 로직 ===================== */
// 형식만 검사 (중복검사는 handler 에서 서버+폴백으로)
function validateFormat(text){
  var p=text.trim().split(/\s+/);
  if(p.length!==4) return {ok:false,reason:"count"};
  var g=p[0],nick=p[1],age=p[2],region=p[3];
  if(g!=="남"&&g!=="여")               return {ok:false,reason:"gender"};
  if(!/^[가-힣]{2}$/.test(nick))         return {ok:false,reason:"nick"};
  if(!/^\d+$/.test(age)||parseInt(age,10)<20) return {ok:false,reason:"age"};
  if(REGIONS.indexOf(region)===-1)      return {ok:false,reason:"region"};
  return {ok:true,gender:g,nick:nick,age:parseInt(age,10),region:region};
}

// 매력어필 기준 : 실질 글자수 + 닉양식 재입력 방지 + 성의없는 답 거르기
function looksLikeCharm(text){
  var t=text.trim();
  if(validateFormat(t).ok) return false;                 // 닉양식 다시 보낸 경우
  var core=t.replace(/\s+/g,"").replace(/[ㅋㅎ~!?.ㅠㅜ,]/g,"");
  return core.length>=CHARM_MIN_LEN;
}

/* ===================== 단계별 텍스트 ===================== */
function send1(msg){
  msg.reply("어서오세요~ 양식에 맞게 닉변 부탁드려요\n성별 닉(두글자) 나이 지역\nex) 남 춘구 30 서울\n⭐️원활한 진행을 위해 새로오신 분을 제외한 분들은 채팅을 통제할게요⭐️");
  msg.reply("닉네임 변경 다 하면 '완료했어요!' 라고 보내줘!");
}
function send2(msg){
  msg.reply("🥳매력 어필 시간🥳\n인사 나누면서 짧게 자신의 매력을 어필해주세요!!\nex) 저는 눈이 맑아요! 잘 부탁드려요~\n⭐️⭐️⭐️채팅통제를 해제합니다 열렬히 반겨주세요⭐️⭐️⭐️");
  msg.reply("인사랑 매력어필해주세요!!!");
  msg.reply("예) 전 밥을 잘 먹어요");
}
function send3(msg){
  msg.reply("❣️ 얼공자유\n눈,코,입이 나온 과한 필터가 없는 사진으로 부탁해‼️\n⭐️원활한 진행을 위해 새로오신 분을 제외한 분들은 채팅을 통제할게요⭐️");
}
function send3PhotoGuide(msg){
  msg.reply("지금 얼굴사진 올리시면 관리자가 가려드립니다\n⭐️AI사진은 반드시 미리 고지 후 사용해주세요⭐️\n‼️이 밑으로 채팅은 되도록 자제해주세요‼️");
}
function send4(msg,c){
  msg.reply("얼굴 보고싶은 이성으로 한명 지목해줘!!\n도용인증 완료임티\n🐻 -> 남자\n🐰 -> 여자\n지금 활동중인 사람 위주로 골라줘!");
  msg.reply("최근 3분간 활동한 인원 ▼\n\n"+recentTargets(c));
}
function send5(msg){
  msg.reply("💟도용인증시 드리는 혜택💟\n1. 공지방 입장 가능\n2. 게임 이벤트 및 매칭 가능\n3. 여성분의 경우 대화권 30분 지급\n지금까지 고생했어! 이제 공지읽고 재미있게 놀자😁\n🩷공지에 미션이 있으니 반드시 수행해주세요🩷");
  msg.reply("도용인증 ("+plus5Label()+")까지");
}
function sendHelp(msg,u){
  var who="🐰 호랑 25 서울";
  if(u&&u.nick){ who=((u.gender==="남")?"🐻":"🐰")+" "+u.nick+" "+u.age+" "+u.region; }
  msg.reply("🤖 ["+who+"] 봇 명령어 안내\n--------------------------\n👶 /신입 : 신입 가이드 시작\n💬 /1 ~ /5 : 가이드 단계별 실행\n❓ /신입질문 : 신입 공통 질문 양식\n🆔 /도인 : 도용인증 상세 안내\n📷 /맞공 : 상호 얼굴 공개 규정\n📞 /보룸 : 보이스룸 규정\n📸 /얼 : 얼굴 공개시 주의사항\n🤫 /쉿 : 채팅 통제 시작\n🔔 /땡 : 채팅 통제 해제\n🛑 /단타 : 채팅방 독점 경고\n❤️ /하트 : 본방 하트 인증 안내\n🎮 /게임설명 : 춘구봇 게임 방법 안내\n--------------------------\n💬 /안녕, /뭐먹지, /로또, /필수\n🎰 /로또번호 : 로또 마지막번호 맞추기\n✊ /가위 /바위 /보 : 가위바위보\n--------------------------");
}

/* ===== 규정 안내 텍스트 (‼️방 실제 규정에 맞게 문구 수정하세요) ===== */
var TEXT_CMDS = {
  "/도인":  "🆔 도용인증 안내\n- 본인 얼굴 사진으로 인증 (과한 필터 X)\n- 지정 임티 🐻(남)/🐰(여) 함께 표시\n- 인증 완료 시 공지방 입장·매칭 가능\n※ 미인증 기한 초과 시 강퇴될 수 있어요",
  "/맞공":  "📷 맞공(상호 얼굴공개) 규정\n- 요청과 수락은 반드시 상호 동의 하에\n- 캡처/저장/유포 금지\n- 위반 시 즉시 강퇴 및 신고",
  "/보룸":  "📞 보이스룸 규정\n- 입장 시 닉네임 표기 필수\n- 욕설/도배/음소거 후 잠수 금지\n- 방장·부방 안내에 따라 이용",
  "/얼":    "📸 얼굴 공개 주의사항\n- 눈·코·입이 보이는 정면 사진\n- AI/합성 사진은 반드시 사전 고지\n- 타인 사진 도용 적발 시 영구강퇴",
  "/단타":  "🛑 채팅방 독점(단타) 경고\n- 혼자 연속 도배 자제\n- 신입 인사/가이드 진행 중엔 대기\n- 반복 시 통제 대상이 됩니다",
  "/하트":  "❤️ 본방 하트 인증 안내\n- 본방 프로필에 하트 누르고 캡처 인증\n- 인증 시 이벤트 참여 가능",
  "/게임설명": "🎮 춘구봇 게임 안내\n- /로또 : 오늘의 추천 번호 6개\n- /로또번호 : 로또 마지막 번호 맞추기\n- /가위 /바위 /보 : 봇과 가위바위보",
  "/신입질문": "❓ 신입 공통 질문 양식\n1) 어디서 오셨어요?\n2) 취미가 뭐예요?\n3) 주로 활동하는 시간대는?\n(편하게 답해주시면 돼요 😊)",
  "/필수":  "📌 필수 안내\n① 닉변 양식 준수  ② 도용인증 기한 준수\n③ 상호 존중  ④ 광고/도배 금지\n자세한 건 /도움말 참고!"
};

/* ===== 미니게임 ===== */
function judgeRPS(user,botc){
  if(user===botc) return "비겼어! 😐";
  var win=(user==="가위"&&botc==="보")||(user==="바위"&&botc==="가위")||(user==="보"&&botc==="바위");
  return win?"네가 이겼다! 🎉":"내가 이겼지 😎";
}
function lottoDraw(){
  var pool=[],i; for(i=1;i<=45;i++)pool.push(i);
  var picks=[]; for(i=0;i<6;i++){ var idx=Math.floor(Math.random()*pool.length); picks.push(pool.splice(idx,1)[0]); }
  picks.sort(function(a,b){return a-b;}); return picks;
}

/* ===================== 온보딩 시작 ===================== */
function beginOnboarding(k,msg,doGreet){ if(!users[k]) users[k]={stage:STAGE.NICK}; if(doGreet) send1(msg); }

/* ===================== 메인 리스너 ===================== */
bot.addListener(Event.MESSAGE, function(msg){
  try{
    var room=msg.room, content=(msg.content||"").toString();
    var sender=msg.author.name, hash=msg.author.hash;
    var channelId=msg.channelId||room, hasImage=!!(msg.image);

    /* --- 입장 feed 감지 --- */
    if(content.match(/^(.+?)님이\s*들어왔습니다\.?$/)){ send1(msg); pendingGreet[channelId]=Date.now(); return; }

    /* --- 로그 갱신 --- */
    if(!seenHashes[channelId]) seenHashes[channelId]={};
    if(!seenNicks[channelId])  seenNicks[channelId]={};
    var isNewHash=!seenHashes[channelId][hash];
    seenHashes[channelId][hash]=true;
    seenNicks[channelId][sender]=hash;
    pushRecent(channelId,sender,hash);

    var k=keyOf(channelId,hash);

    /* ================= 명령어 ================= */
    // 게임 (prefix/param) — /로또번호 를 /로또 보다 먼저
    if(content.indexOf("/로또번호")===0){
      var rest=content.slice(5).trim();
      if(rest===""){ lottoSecret[channelId]=Math.floor(Math.random()*45)+1; msg.reply("🎰 로또 마지막 번호(1~45)를 맞춰봐!\n/로또번호 숫자 로 입력"); return; }
      if(!/^\d+$/.test(rest)){ msg.reply("숫자로 입력해줘! 예) /로또번호 17"); return; }
      if(lottoSecret[channelId]==null){ msg.reply("먼저 /로또번호 로 게임을 시작해줘!"); return; }
      var lg=parseInt(rest,10), ans=lottoSecret[channelId];
      if(lg===ans){ msg.reply("🎉 정답! "+ans+" 이었어! ㅊㅋㅊㅋ"); lottoSecret[channelId]=null; }
      else if(lg<ans) msg.reply("⬆️ 더 큰 숫자!");
      else msg.reply("⬇️ 더 작은 숫자!");
      return;
    }
    if(content==="/로또"){ msg.reply("🎰 오늘의 추천 번호\n👉 "+lottoDraw().join("  ")); return; }
    if(content==="/가위"||content==="/바위"||content==="/보"){
      var me=content.slice(1), opts=["가위","바위","보"], b=opts[Math.floor(Math.random()*3)];
      msg.reply("나: "+b+"\n너: "+me+"\n→ "+judgeRPS(me,b)); return;
    }
    if(content==="/뭐먹지"){ msg.reply("오늘은 👉 "+FOODS[Math.floor(Math.random()*FOODS.length)]+" 어때?"); return; }
    if(content==="/안녕"){ msg.reply(sender+"님 안녕하세요! 😊"); return; }

    // 규정 안내 텍스트
    if(TEXT_CMDS[content]){ msg.reply(TEXT_CMDS[content]); return; }

    // 통제 (안내용)
    if(content==="/쉿"){ muted[channelId]=true;  msg.reply("🤫 채팅 통제를 시작합니다 (안내용 — 강제력은 없어요)"); return; }
    if(content==="/땡"){ muted[channelId]=false; msg.reply("🔔 채팅 통제를 해제합니다"); return; }

    // 가이드
    if(content==="/도움말"){ sendHelp(msg,users[k]); return; }
    if(content==="/신입"||content==="/1"){ beginOnboarding(k,msg,true); return; }
    if(content==="/2"){ if(!users[k])users[k]={stage:STAGE.CHARM}; users[k].stage=STAGE.CHARM; send2(msg); return; }
    if(content==="/3"){ if(!users[k])users[k]={stage:STAGE.FACE_ASK}; users[k].stage=STAGE.FACE_ASK; send3(msg); return; }
    if(content==="/4"){ send4(msg,channelId); return; }
    if(content==="/5"){ send5(msg); return; }

    /* ================= 신입 자동 감지 ================= */
    if(isNewHash && !users[k]){
      var greeted=pendingGreet[channelId]&&(Date.now()-pendingGreet[channelId]<60000);
      beginOnboarding(k,msg,!greeted); pendingGreet[channelId]=0;
    }
    var u=users[k]; if(!u) return;

    /* ================= 상태머신 ================= */
    if(u.stage===STAGE.NICK){
      if(inList(content,ACK_DONE)){ msg.reply("좋아요! 그럼 양식 그대로 한 줄 보내주세요 →\n성별 닉(두글자) 나이 지역\n예) 남 춘구 30 서울"); return; }
      if(inList(content,ACK_WAIT)){ msg.reply("네 천천히 하세요! 기다릴게요 ☺️"); return; }
      if(inList(content,ACK_YES)){  msg.reply("넵! 다 되면 양식대로 보내주세요~"); return; }

      var v=validateFormat(content);
      if(!v.ok){
        msg.reply("닉네임을 양식에 맞게 다시 바꿔주세요! 🙏\n성별 닉(두글자) 나이 지역\n예) 여 호랑 25 서울");
        return;
      }
      // 중복검사: 서버 우선, 실패 시 로컬 폴백
      var avail=serverNickCheck(channelId,v.nick,hash);
      if(avail===null){ var seen=seenNicks[channelId]||{}; avail=!(seen[v.nick]&&seen[v.nick]!==hash); }
      if(!avail){ msg.reply("이미 사용 중인 닉이에요! 다른 두 글자 닉으로 부탁드려요 🙏"); return; }

      u.gender=v.gender; u.nick=v.nick; u.age=v.age; u.region=v.region;
      seenNicks[channelId][v.nick]=hash;
      serverNickRegister(channelId,v.nick,hash,v.gender,v.age,v.region);
      u.stage=STAGE.CHARM;
      send2(msg);
      return;
    }

    if(u.stage===STAGE.CHARM){
      if(!looksLikeCharm(content)){ msg.reply("조금만 더 매력을 어필해줄래요? 😊\n예) 저는 잘 웃고 리액션이 좋아요!"); return; }
      u.stage=STAGE.FACE_ASK;
      send3(msg);
      return;
    }

    if(u.stage===STAGE.FACE_ASK){
      if(containsAny(content,FACE_NO)){ u.stage=STAGE.DONE; send5(msg); return; }
      if(containsAny(content,FACE_OK)){ u.stage=STAGE.FACE_PHOTO; send3PhotoGuide(msg); return; }
      if(hasImage){ u.stage=STAGE.DONE; send4(msg,channelId); return; }
      msg.reply("얼공 하실래요? '할게요' 또는 '아니요'로 답해주세요!");   // 재확인
      return;
    }

    if(u.stage===STAGE.FACE_PHOTO){
      if(hasImage){
        // 진짜 얼굴 판별을 붙이려면 여기서 msg.image.getBase64() 를 서버로
        u.stage=STAGE.DONE; send4(msg,channelId); return;
      }
      if(containsAny(content,FACE_NO)){ u.stage=STAGE.DONE; send5(msg); return; }
      return;
    }

  }catch(e){ /* Log.e("gongju-bot: "+e); */ }
});

bot.addListener(Event.START_COMPILE, function(){ /* Log.i("춘구봇 v2 로드"); */ });
