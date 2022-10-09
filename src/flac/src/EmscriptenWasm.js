/* **************************************************
 * This file is auto-generated during the build process.
 * Any edits to this file will be overwritten.
 ****************************************************/

export default function EmscriptenWASM(WASMAudioDecoderCommon) {
var Module = Module;

function out(text) {
 console.log(text);
}

function err(text) {
 console.error(text);
}

function ready() {}

Module = {};

function abort(what) {
 throw what;
}

for (var base64ReverseLookup = new Uint8Array(123), i = 25; i >= 0; --i) {
 base64ReverseLookup[48 + i] = 52 + i;
 base64ReverseLookup[65 + i] = i;
 base64ReverseLookup[97 + i] = 26 + i;
}

base64ReverseLookup[43] = 62;

base64ReverseLookup[47] = 63;

function base64Decode(b64) {
 var b1, b2, i = 0, j = 0, bLength = b64.length, output = new Uint8Array((bLength * 3 >> 2) - (b64[bLength - 2] == "=") - (b64[bLength - 1] == "="));
 for (;i < bLength; i += 4, j += 3) {
  b1 = base64ReverseLookup[b64.charCodeAt(i + 1)];
  b2 = base64ReverseLookup[b64.charCodeAt(i + 2)];
  output[j] = base64ReverseLookup[b64.charCodeAt(i)] << 2 | b1 >> 4;
  output[j + 1] = b1 << 4 | b2 >> 2;
  output[j + 2] = b2 << 6 | base64ReverseLookup[b64.charCodeAt(i + 3)];
 }
 return output;
}

if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode00c5ÕalvÛ50Å<²E@G£xÄþÇ,¿eSÝ·)<Ù°Æµ}ínm»K
. ¦thHzwó¯¼Â¶fH×U6OÚ1üE3cÓ¸Ñ±«þxz¨æé
¥Ê­FÆIHF®Süçã[§ÕÒN%b*3âdÝh¸©=M§Øï<êÐXVÜÇ#'\µ×4u qµÓpìWGb^Jr²bºzR¹À"û¤ñrIábÎ³'UøXbÃ%+ÓÐ¹@&±¯/I
¦@~¸£AÛ.²b,ÛÚï9l
Ï«ËÕMMÀrõæ%Vë'ò:ì}ÌÜ®Cð3Ùó¡Ü¼M¿B¬ëøRJ«c<³¾¾<>¸å0wÂMpAÿ0èr=M[y*³ö1@_û;~ühýû= 0r?0Ïà:moá#p	y}bXb)É.48±& ö°1Ï6áX«Yq0RÓè£Ï¢I3íåÊ[9ÿzV8Æ')FXYÖº3r¯	©pÌã!Uö®qzÓ(= ØYÈ6±wjCNÅ«ÉñìÚ5Ï%¨G
VöÐÏ*þÜ
ïðSÜ«©Ú/ï[fÃY]q¦¡âöwnjaË£=}&ïC®bk¥rR%]öQÚ_&¬#C=}ùk04\ÒÆ"öa­éØRõOöWßûYGÈeæýÐõÍ9K.6»ø
ÿèr ð(vvdäêjð	6ñëèwû©DFÈ¹=MLæ^ìr9ìþ£Ç{Á]ë]#mËI|×4Z|G dÇ%«Ô×Ã´2rªý¸<KîÆVH,U×Êt\CÎÁÄSJâeDÃ½òE¤Öþò*·¬òó=MÛÄi@¡Å;Ôüü^¤²b¯**À:2xyB*5XL1Ã«ÄIEÎî­¸ì²¥å?Ô¥ D÷ã­e²b{c~¦Ie9¬qºÎÖ±¾+à°W.^<[ÿ¢hGC¤T8ZT×=MËòÝS9È¸tÉ¢Áo/Ì ¦hÿ¸°6ä½mmÄs²råãÐ­²´a¦$Á}Ó¾¼EéPïÑ4¨v[
öB®-JçµóW&a°à+H-rè¨0èó¹¹Ç_üpéîXò·ñ×íØ=}eï¯üÚlO ÇÔ57=}¥váW2Ô\_:ôw&ýíK64$gã¶1rö%aaÓøb¡-SMõ7Ò.yõõ!ôþ_7Q%¡ñ¡Û¿7ãOT·¿60âeéTÜLw* ¦[r\hîuácý5f¤B= º
Ù ª$û×ÜÙvn0´HÕQØäOYõ÷¡ù"WÆV©¢®*Ìôq@R=M(ÃæYß'£ËÆN¦ðÖO©hP
7.	!/=Mh0©j:×²ZN#î_-ï	|O9Ò¦
°
öà
þ= 
 
ø m1(*ýÈ×Ó0ôþÿÈý!x7×*þ³ò¬sRÀô,ê¶6kia(\ì<úþßS\¼hqõZª? ©ËÝ{µB¾<UdÓæZf÷Æ#9ÅÂ]ÊßeÕ= -¨ö¹7XIÿ[¤8	ä·$Hè­,ÎOXA»|¾¸¶¶éYJâ°>vÊâLfó-½R:|³ÓhÓSó©öTk>¹½WÙö¥é[=}ügrp±YUcÚ= ®ÛpãMNú×= Iå>QHvà75ø kÑlþZì@LÁøTäv{7bÙêÇ×:MQXºlMò¬Cvj?Ã.ðpòºïe"3ða.K-1!/14ñ@¹¯«þL {¡â×ðéoZð×7sPOz±Ñd{Ñ ¥mi~yÆ$¸³VxDõÐê6åÑw±¥I¦j§@NS!9PJ9}¢7ÊÈ.nò5qF1æÂHÀÎÞ$ú2ãòãÊk§½ðhW¢ÃY39^H¡t@Ô¬mìÞZZ÷.3Añî¨uöÓà\TvÒ³oôz×-ÇHÌKü¿¨c°JT
ÜÑÇÑáÑ¨4ÓBÎ~\9&Å%2uMKb/Ì½y´ë¦=}ÍC§¿]ö«åVó½6V7fVÑÑÆP-oñ=}\Ó=}UáSÞñD·/¼3E4,³Y_©9þR>ÙRáDC"ÄcSU8'±¨
6¤[¸LïUá1',þÃª'»ää~îÃ+Hr]Ûa¤o¡q-ÃÁ\
¡¹)«±Þi¨AÚò"_¾oÏCPÙ¼ÔCõ+Ú1£¨IðÌÑÇñ@U(æÍ­ë^¶|<\ô¬©ÔCGUÊ©OÄNRähyØÜ7XNxÜsLïg= ~ÐsâýN¯×ödÿûtÎOñÒ}ïË¡W*ÊD'erDbÀM+Æ_Çÿ9²ÕRbhJV¢bö)Ñí;k"ÃA"Ñ]Ü¬î÷
õ$ä3t}Õèïìïø'cñ!­U)n~(r?º m|³pßíyâõÍ/øºeb â¢3Ý¯ ,ìî/ýS_Þª_´ã¶°/;½rÌ&_ÿâxÞóù7Iò~Ä(%*HS&¥(ãðuGµE%	m*¬OFÜ"Jx2«Aï9M¨wm9F= À%ÁÄU}v¿ÒÜûTt)¶ÃÃ·©åb>HCAP\
#§B_B¥4¦Ò|P{5*ªñ¡s¨ò¦ý³ÐÜXúó¸wÑ= Øè'¤DÝ»JúWà¹ÞlS#9í_¯B:ú¢6®ïéøú	,!Sú(Y	í
¯uî¤HlGÎ¥UÔFx:ÇíEÙ)%Ýc:ÀºÐ¹Kì2®íçùÑB?¼µU}äÆâõ*4ñO~«¥¶í­v¸ùÍçyÑbÃ5@Ù¸¶LT¼çÈb|%³8fèe$ÀtÄt¾ßë.kaåkæã_ö6wÍVuóÈ°§k{GâPsbªfÌ¤=MÔ+wú D@<#ÇSè.x×Oo@/)-iDbü£Z*òH»ïìôtAµ­e,.ébS1¼øøñø´¯¢Ñ¿T^^^¦,k½osc³º§ À.oWG÷÷÷÷çpÒÉF5ºÑKêG.ã.²5[yµ@_qÏ{¿Ó,·­öjÌàÙbb0cgú¯ËpcÕ§Ðú@É8m©*n3#e|ëé8LXBÚYYö]cë£i5R5á=MË5ÈðÈÞHÑd¡,{5Di±
½¸"X	#YãÅÔöÜf£Ô'2b±7NUPò"8ÏhÍSý×-F9ªiðä®è"¯ô;#TåÈâr'0Þ"úaûoëôG°ÒçÇnÿBoõ÷µ!NÂ26¹_0Y©o³¼ã¼ØÎåj±OôÏ®XµhNÒÍãxëâ¶þÌåð µ¬Êm¹Ö33ñFØöÇÁï(ÍãÑÈÆQç¿~Î:ñ.Ò Ô¨T|f÷"t=MqÒ=MÃgØë¨êÛ©¢Zaq*±Oß@LÉ>´´¸hÓFÆûHe¶UX"ú8§	<aß'Ä%_9ÓôbìOoËiÓLR¯õs1½8ÃúßF®nbÌgrÀ1= <}³QoGÑ¶OT¼qu= ìÀÚK¨dõÍLºBÂÌì7´´gÆÝ±Ý¦q#ÈT«hN=MñýË¬àa2ðÞi.hìëRê¿ËÌ<¿<ÄßKG
¨Y¸]KúÍñ)þ,°ày¿µ­iØ&¤,¨}NeÃY6ÈÍà÷AsÉ¶-]ÖFîUKö#½õÎT0qtù§aq
aÚù§1'aq§q§q«T:¨q;Qx_æ/éOPýpaÕ6Ëêß6Knà.Tkøã6ã[qt£®QâX òÀBj'½@õºßäh3"UÓ]*ëÕ&Ijg(±/-¥[2ÏPÏOöÿtªÉ= q4ÑºFÅ\É4Þ¨/wCÉ¯ÓæÒiÈMèÕàÊ³	¥óÏ¡FÀZÍ¡4Ö}äÉ³|Î¡OrÏaF% Ï¡ÊpÇ|¥¢õàÇ¥¥Ì±2yë3éçÌ[îÍÏÛÐf?x/¬?Ô«K;¿mµ]4òRâù©.é,*áÕSvk~VãÅ*v¥=MEÌÏöX¥V¥ú=MÉ²ú:êF~TsDçáoÞôEÊzöÏÿ¢²²Õ¼ÿÝë1Q,Êìçø1ô^M­¼ÝG»K ÞÝ¸"b6ígÆµãÔI=MÔH>3;Íõs¤®µL|S=M£¡ÙY=MièòÛYÕ±ËÈð·p]@b:WrÖÖ$Ê¹ãÁX\ý6'¬O »@í=}4G <ts_ìé8&CÔøæÄ4ãØ08gwpTC.­AmD¹+4\wÍVÍBÊ±ÊDQxÛxmõìJ8ØxbJßÃ	ûÝýBïP¼¶a=}Á²¤ÁÜj#_¨8O¡ÂÒ/¨?DzP¿÷ºFå= ¯üSôÄ8Äî&Åô¥fºe±$Üì8Äï:xo+µd
X,¡jehqÞ MQ¨*@V k¿&17ÝêQÁ¶L%ZÄ»w>]Ü±Ôë¨pEZId÷Ñù75K/ 	5çúL69uQ>ãÐ9ÎèÌVJºST0À5bQÐèÍÑºÝØL4àrn]ü_½¬ë#ãÂ|#)£RØÁ (´±>gvæðâCÜûÓ ©P§YÌèÉ05âûÌÀÇ¯¢éäË= X#¿-sÒiDêrÜï=}ÄÅÈ¿4z%öÎBa¤TÃ+¸~Ç¯(MïÀ(Ï¯sµ#FÂd°$ï°ÑôøÍäaqØ}ðLØÑîÎoJIæ=}ôÁ0¶<=MeC£²à_&ÔìôaÙ¿;ª7ÖÃãRnâÄ´Ø	)k×¤9ã(eTDðúJ­hÏoE~kgû¶Ëø+9Òø~1órTþ>ºXáGÞ9o	ÅÛã8ÞÏ¢döÀJ«¡¤5m÷=}%d¬øÏW®»0{$(úëòÿ3;¡CæóÝ|¤9¡C²uÂC/*À|$x~ÂÓÞ%æ8(À9ÀÊp±ú±v2:¶o~ÿ¬EÉÎK7,6«½ù©¯rÑ¥eT=}J´xWa~²W8ïþ|7ÃxWaTWP4e9=}= gYù(Ò3eä¬b0+À}Woj6?À<Óè= Òðøç ÷_M¥ób@¸Kf®£¯µ®:àøy»YIóíLÿX¶aûç;vLË>Âð§nõmB¡Óc2Ë³.8^fA'ÂUlY-.¹= L0­'/ZúäL,õ¯^ß:Wjµrèûz«)Çsô0¡æl
°¢ÄþzÏãÅCÃ8íÈ<ýG?¢Ì¾í}Û Ê)Ç3¥	q
GûØµ¾éÞÏ{ÔËä­}-ÏàRÒ*Éh\Ê.¡8&ó·ä?UG¦¹vþ¡\]«ÒÓ¡+zp%¤_¬|3=MøþÖ58 èÛÂ·|ÈI»ê]ñõnÃÞ8çÖÓbÈZ9DdàÀ|ow·9È¾ö¿k}B¨tÂ»ØÍ7A.¤µ«×?X½n>vc½B5Üf·³Lý?ÐHãeøeÑYú¢b'1= 9FµÃ'Ä#GL°Ä¾óïÄNpÕºÜ
mIëiBLìBÁ ºN.QÄýsov£T6Ôæ¼Ôi[^9µ4W+Mx²Ú-¿Aîðq= ¢·@"Ò$¿æ¶ºx:ºLÝ mjÛjÅ\t	A{z}¤Èïïã%JÛäÅ&ÅR×G|Ää+ÂD#Ü·*¹ä|t»mï¿ÄWáóO/\:¬êúD=M¯ð&þ»ý¦ØK(³J"e0¸"]k¸2S# ¥6wb¦yZKS«ß"¥¦ ëõU|LCÚì3ÍfG,&fJGJ~Û/Ûïòùñy5WJÐ@ñ©ýTjG8GófUf/*fg8êg,9j	Z­ÊN#1æ?ê_×= ×"NgÀÒßW{h©fY]O= ÑíÂÙ*ö
EËâgQYïWa=M·%2vW×sçFðªKEpGÕYÝî&QÕ?ö-z»Ëa¨:<EHOÃ2¡ æ4ëý¹æ(RvÜ-ûrNj-Ìh¸Uº3È
õx÷½RëóÈò"Ëµo0yÕ:Ðøb=}òÿ¶1b½ÞíP*e	Tiî.Cûê2jX9$4UWy§ËM¿îÑFwåÁXñÈ
WÓ5²RÎï ÑÍf|àH÷Ó£\SE?nÏd/-~Ýº;3Kw·fa/>4í,Y¸r êNÃÄàNB{GìÎ³8[8	&»4¦Ù¢êÕ+Õ4ûË]/wH£±bú©}GÏ4é¢38:aÙÿ$dá!íd-ÍPZæÁé=Mç¬dá!ËdÉaæ}©XHPGB?59¥
¦º¶óXûaúiÈ_ê/DÌhjÈ¬Qðüki[1cYãZ%¦}PmË!|ÕNßn­=}íXÿùÒÏemÓ^QÙåÅGXøÜÞÌ|Õ<ÊpYÍtÂöé¢= ­~²c1Ú;¿e|Libhùý7ôé9	ä¼sîÝüÄìÑ¸¹qOÒ3æ0QÄúë-Öõ¶ó$â!ÛsÜ¯â! ²w>öYØÊ¿¯DÊ©Gv_3	Ý*.çîÇ7ÿoÏû#Û)TS±ÛÆ¿±$= = Z0eQSÄÇÊÞ ý_Ç}yT%nãg<ë£s½ÕT»w¸XCCWTu±Mt·Øö²æé6T$úü*[¿<[ú·£'ÿÁëôx³GÜÐ«[K>HëË¼=M!pdQ+ë¹E]¬ßÕ¨E¯mAßM43¤1ÙA,YYÁ;ôY¹´#·ñdMªøvA_*üS¤·ýÃÞñl(@lªvÂ^í¤©D% øÌËv¦ÃS2I¯%°é= ÒWzB
7Wqí%ðþ¬¨ß£Uás£÷øl(þÝ'ûÄ-,ßU­øÁXiqµ3ó ØE·(í¤ÄÓê2?äNöcªbK×«±Ù'HªyZ?rJ;É(ÀgVi?u¤Î®~»1d»ãôÀ&Û±²»IKE-U8¤¹ÁÈÕâÎ"KËvoJëyÛ¦ñ¹L©}ö%Å2ãÉé³ªa ±y\·4ÃbYDl!Úóöm´¯5Kï=}_)ôÁ¦Y_ÿÔZ9¸ÑÐ­éNµæûF üF³Åb«=}P©S:]¦9åûLw,6¶f9w :Ð9ØGJ5¯UÖ'ªÌ;P ²þn#á{@[æ(5%lÎ¢hùx{qÞè)	\©¨
:»MËrrýB¶¡p¤Îx å/´ûYî=MP¡»Ôã:
õ÷âÛAíÖáú6+^sxð§Ï<çÊLÝ«G]R;ËøaÚæíÊ¯RlX2Ú7òí#îT=}" ì5L=})6³Ó]}~+ß¸upöãL(Õø1¥dq«úÐÚ,ÚF*o6©$à§èÓG§åí­çÙ±³7°Ùò:KFê±qàÁ%¯ Q;ÜoþÚnîWO-07üM°¸]½Z×¸6æ	h>ì¨¿à¸-7îHª-7Q°rñÔ,§WÐ92Ê»n£&ÚkPÔaê6.N%ÁïaÕKjÙéÿLP%õÍn!õZ×0|)2ZÜöálåâáJ£õeì­	E_Ì-åj³Ît¶qøAxµ¡Úlë=M­­ßñ2Lxe#$¦\ðyB6pLõ©5§*«ØMÊ¤ÄòÞ8[æ¡~êÝeAÇS8îØA;¬A®ÿ!gçS	SÛóZÉ=}Sû5Sá+I±æl\çp=MÖ6u×
£Å,ç})ÈáMEf,ð1Em;õ®~zUÞóoä+jüBñÑ»	£H\Ñò¸«äió+Xâ8n@nÙ=MÚõþ³ÍÂÀc¼ÊüXå8Ö+§ãÏm5sîD´×´NC°¯ºp<t#d|±Ä÷I¡ÈOCb¡[tÐÊ½ñùìeýóIeê¸d]QLg>+j6¼W¼ë(ØÛæÊkÔpÔlTäß{,Ú¼7¢µg¥þ?ò÷ú$º´lù7*ùÛ tÑ»à{y.M·5uÂþ4ënÕ¦ÝïùæÙ8jÂ¢Ë¢1éàvtÆ¯
µ4^Y¯ï= ¯_7fÈmâuÕJÈÏÑ¥®ÌÚéºGèQ¨?Ì¼WèÃ^£[8Ä¢-läø&%¬'²/ó Aõ7êþóî«Ü§É9|ìåâßÆ¨#
êâñHÚA¨pµÑ¥.ÃG)ºÊYË±Ø«(sgÆQ±[÷ÓRÝï¸h+í¦ë£4¼àwzÀÒ0QÞZÇxÊöfM§·CN9nyìº6&´Ä4ÁÃ4Ã¶Ä¾$¤=}#V§tA¤Ä¿ðÄ¨p®ò*À7b¯¤ø^gd×êád$ ÔCùÊ&xsÝtþ_ÐXÀåõöÆ¾ÐEÑª5¶Å§Bk_áË q·=}_½kå"= áp5ØÌ~ÄD»#(d:,ÃYX{ü$®Ã3¶]ï2(³¿4Ñ%ú×R-þ?øºHJ)jíTI{!HH¦ 4³T= o?zí×("«B«ðuük¶ixFG$¿pË´ÿH¬üäE¥cb¸e ,9"
â"ß¹2¤ç¬Ö©úR4ñ5ãÒÀõà¶ÏKnò.¥Ü±8ôTXË'ùµÞ%8¾üÓpÉèÈ§ÞÕ´¶s à<= ÎâW®ÁRûä3µçýç4É~=}IP¬k¾R²aTiô°4=M£CõÓ¸èçK á{oð?ÝÑØn·:Ä¡Ï¥ Ó[ßX£¶h´?j¹YWJ¸àÙãºÏwâ8l;³þ}r
	¼&ØîZÂÔ_*4ì8-¢¨¼(sClf%~Ð}dÅ¥@ñA'rvÚ¤.Aj«^°-üCÉÔ¸>ËÔ0Äõ×	'åËýyDÁë¾ò¨ðTº ­¶zdyüã°67h= Tº5?5Âl9 l< }[ºä{Ã´pGÏ>¤iÔUÊjxjXÓbàQË= ÕeÂí$¢ý)ÉW¿ÅÄa>DC-¶[Ëè}"³k}Çm/©¨¡¿(¸/v¸BXì£µ×ÀABNÂj®¨}Gpq&Ø.ÖXb£ýÚ¢C	1äÀìäÂì: Þó&²srp÷y=}Lk2Ú³ÇµÁâLo>Áµ/=MêÜÕbbÕu)ËbC@sÉ 9ïG æççêñð"ÝÝWUY'VÏ44=}âôqÀêt~VõPÂÛM~ü¿áÚ-ä¬¿}6î@bûÄx= Þl5±k+oýúFïH^3L®pN´çQT>ÖÖ;4\üY#öûúÇÒòê9÷Ð:´Õêât8cÑÔ ÿ'[PøMõ\\~N$N$µÊu¬ææÍ6FÝû»ÉÖ×Tú-´3RG@x>aa=M°_¾¡b¹Ea÷xxéQ:C*¯°}WXK./Ù¥9¾~«ùÇ{ð¯ÒOé#LqÖ7È¯a»=}+Ð](åÏÝ=}ó¾Øß!Õ9Ø"Teçúm¼ctsÔó>Ç°ñÃçÍe¸¾ÂEW5ÍìE©îX]vq²ZÛµ¯ZþHpÐô ª9³û;øÂîÛD2òY
TÜL]ÆÞvw_f°
ýuÉqìâCº= óÊ«7µ'#êkãH7Q$NÆ­Y>u<K5¹R8ãÐ¥	<eÊu?oíX|Ë/k÷t²ÍH§üXÊRÏ²ìP= ÷R,CU¢¿<÷1,0"h+D¸j+n/2ÜmAÛ7Â{6³j.1Qíkè5<¶àRÃÿF§­ §×= RKÄB?.'&V&ïÇºVóÊP$>íëó~±°kÝ&KÖÃ®ÃQ=}-¯£á¢½Ò®²"(T £ sÅìÞ}+½rZ#!0	ËËlþ5ÒU(aüVÇHáçJ&Ðüfá\ÌK}×¦ø9JáM&½Qh~®$d þC$61¤EÛ7¤m¢O±Z:GïFP÷¥Tcb§Tc2²#º¦õÎ,_Rm'ª=}û°0dnsÆzYë7hÏM½ð³ú\¶,J½QµÜ ¶ÖÄys<7¢£[¸Ør$]Rá¾Väý_®}Õ¡6S9m¶j-ÑZ+Éh:ÊIáØÓÔ+³]=Mô¤úzþË©©ûå;ðÕØFaéðÊÙî[£üèÕ,ÅVåíÍ7ÑPÝ")ºJ×:FápJ=Mh\Ki à!ñ°$ç¢&u¦Hv%.t= pýc3= ×t»'ìý06J^Ô%$;I±¶&6¸ñ¤9À"dÍAsÙÝè)²³°ÎOBg%à«Ç¢3j@?ã=MöéugÀ;àºjÓ­i;pÄ~Àw~Ù,0!êß K{0±BÈìz´°£+k¤¹Ó?2'Aã|7Â|1c()jþk)Êma#ïo%n¬X(¨ÒømÁØcü9;?ã|¶3ì¬6ª3h%EôÞ>hÈÓ´ßXY]gM9Uëj­0¹Só00Rã±ÊôÊ}¿rf¦ì¤ÑSÉýÃµyùáêN¨ÂÛêNîçë»çE?|ÏB@w!4QLr	ÐgËó~å@cÿì¶)È£4=MßîÖìÇ
­«{±£ØH-9rkÀí»á¹
v¨ËÂ;è©Ø¸/GT§¼èÚ\ÍHËâM)¯­¨D=}Ëìw¼| #ðQÁ¬RÄj¶@$½´
2LgÔx£ã£'jNZ<rÛN^¦¿ñÑûd½Dë ¢§L®xí,ù:y4bª°þtÜ¿Ãòr°v¹zÄ6(®³«ÂÄ ¯7¹"Qj¼C¡¾o¨Ôµ-õ¹ÁÊ	xK$Ã¬5{dJ·RjÄ= O9õ6àiü OTÃ<vÑó?è,p&Óã­%Ó!$áÒp¼ñÎÆ«Bý\Ý$N÷­ýXÖ¶\-þ¦­ÄYeQ	~ò%×Pu-â	þæ]Pøþ+«E§#£2 ì®0>ÍâÍ¡£´¼ù~Þ¹|Có·ß¯Sq³»K§Ü&ßAn¤tyT¦YàÆÐoºÕîÔ¹Ë ú¨/=MÙÿ:A;>r±§)úY"8©nF}ê}^çÐ8Ú$ã@ÃÀfzp*°¿(0FA1Â~fhxRrùyyk1ú-?lí´G;~²x{³X¯#@rø²êkZ& ÑÆ¸Eò<³JPxôÃ¨ëÁçe¥F'!±G=Mis
°õ@¼uÐ¢p<C°Mñ Óò¸ÕËØJò.pJpf¤¢7ÎñÎ©æo2ÿ<r¸ £Q¦âO+÷¤Òô³O:Ü<%Q¸òÆtWo>ôL>ôL>¼ÂHÿúªõ®ªõ®¤Þ_§Q\QÀ<²¬eXW¬ôêÂbÛêzÎêk¹n¹ÕvÄ3bèJhXVh¢5þÇw6÷FEÃQë³£Æ!¿=}<xói¿Ç=}uzµ,Ù¨þ¹6Óæ\9þËÜÙÏhø­T´2¶µ7K\Vß±>íÞÇxäÁÒâ"#¼|ÊÌÛbäËÏï1áûFº=MêÜW ýÀ^IÀòÛc²0!B¡iñ+dÏ*E7}uNj¸·¤¸þ¶ÿX|F±£u®ã5:¥Si¡@?Öµ)¡Ã¢Çfr$Z«#G»1 = Ë¡Q¦Á¬ÝTþ¦o=}Îmî´ü¢QÎó¾}n¼Yñ1wÉxsfôzb¸ðêù/Úµ¤M F= ðÐÐ\âtë0B)óLÏoçí3SGFXu®k1g"ÈµF¹lB>E+øÒ£áeÖ¢2%vº¼ÑCSô8*Òó>â úZ0\)Ùï±nÓ~	ag¬W#·,ù}Kxoð,QNx/Ü zÍ
 ×{ßfU­xÁy5Òó7£DpXy±¼Q¥rÍMÍVIÅúÉÎû¿°',ÑM oÿª0lcV,Hârøtú;ÂØêàÆP¾0½ |f3o®B8~©4é:ÜÌJ%ìåk®DYéE÷MÄöpÜ?aSÿ#<]Cv¶6À[<*QîÃß3Ô+á$çÔÿc	ÝPíÝÙ²Ò·/í3õ[H(5©ËÓã,ñÂ h-IPÞãÏÓÙ÷ý+!åt]©©8òèvp6
?zÉù:Ëþµ¯èhíÂÏj+ÈxXÎÏ=Mø= -É§ßlÎ¹¯ò;ésKÑâ*N(d£F%Sr­oç³fRÝGNSr@Û¹6·ÒÂøaØ"Çð¦\Ç³Â,¿ótjCÝÛñXÇS= ô­N-zT>h%7¥D]6TNHQÈÅôimøÕÍÏåß¸{í¾6Yl Pm¬ô§m tÎPÃõ|©­þt= FpþHæÝ

ªÍB¤òt¸ã×K­FÛ3Ú|¿ÞÉt­ÙÉøÏÞ(PÕ§Ý©gp%­>q)Ðö8ÖþMù²|)"WÍbeÔ9Î×¥ôJÊtØ¯Õ~1ºèÓQPè¨°ÚyÌ]Ö>èÐÈ®i<µZ)+jïCJp£;>±U²Ûî«Ñ<¹u»ÓJH»ç§ÑAÉè	dÆ©ÜöÜ¨¿Ë"sÃlcÊjì5®Np»Pd-ÖÉ²?	¥Ynä
I³.Õ#aeAgBé!@¶p³nµÏÿ×ÜVÖ¹#ó#ú$Á6§±Øó3yÖgEÝÆqØ¢2õÖw3÷¯½U/ÍÍ¨ëgðìT3xs¸¥ÃºÒ= HS¿Á^Ò= ¨-8¡ö= (GhFjzK__aÖßÌp°)¤|OÐ?«&qÑQÿvwõuSçÎ,F.Ð·®gL°áêú±ËÏ²³1aOèú··ÓrÀTaÞRY)1ÏYn"ú¯H7áª0÷s£3û"©ùw.ÿþ7ùbxZ®ñþWkxÁkXX~ú½òëx!^7¢)÷ô³-÷ºkËPÞVjÆ=}osoo{·o8<¢ø¸\¹+<@<,%õþ¦§óÍGåÍG].Ñ7ñ'ñ5ÌýÆÓ}ôÌý&ÖñG
uÍÛçÑÓ¼£Ä£À|¿´ãøse£¤¤ÄD´°ÃìÒ6 +­{2= ¦¡= LvQ!ÈôÆlØ?y/5Ô*6Ä[BÜÃÎ5ÓÔ7vË» O H ÿú.yÅg µìâ9£!:t¾ÇÞ'|5^4 @«~GN»jÂ¹æV¢Í«/"Nðª@
é{@2ÅG³±²T±²vëwÄ¨Ä ·TDöFÃ#ÜâÖ?TIÓý?-ÔIc5¹_(Sì¹MhIã7¹âfÌáé9dh4Î¢¨­ÊfáB­ÓÎ¢«­0á²³þwSÄb2{·I]£]{â2z(ä3'}®ÖKèäs(}³ÕAý5­ÛLÒKRÔÊKLÊKJÔÑäÝ!_%îh?_ùLª´:»OD¢4*¿gLÙDµ\ÍnÄ-Eãjý¯®FhTÉSúýåzÉ sºÍ5/ÊÆnúìð=Mr(¿wg©ÅZÙåP!
7ÒÚvf3>Òì#nV¶òÀFÃpüã3eG°n+Çö^Ú!Î¿]p×iêïLúBÇp¿ÝoÑ¹öæ¥ñoÅË¿-£®.ùRã}¦æ­¿6¤îÓÀ+5û7*8c#4¥JåôB¤ruàp=}ÇÒ]ðhú!Å´ v1+úÌ+ê¬};ô;úw;0|u;Jz rz y;Ft:0*k5ObgÚl-­ÙÒagî/aghÍagÏs9#Q.¶
/ºÙTu?ßplz?K×qêJpSKwÙÍàZ ¥irþ.pOXû9Ë°iúâ.ay<LÁZ¢ßØ@=MBLQ.&
!/&ÊÏðuvÇ s*MË»-"¾rð6ªsÁZôÿªÔ"¾jô0¼O.^	{Û 'Jò{vpjzp*$åY#Úõ9ÏË°Ùù²ÙâÊpFUªGbê×ù{·Ï 0*0r,/uq¬cåHjô!¿j´i¤}¹Ø^"äi
ûºk#~Ø;³ßòÛ­Áé;meÚé!*leÚY)ÚÞöÿºyùØVòìZ¾1sê«_­IÎÉUawjîYê©úW~ly1Úk/$É-Ò?ìj\5FwÅ"¶ñ(6»YÆcwÌz¡ú@ºo(ïùW±Î×ioOØÿå@øì°¨¤ËÃÞßªt©¯ßDéü0ùD}O|G,L7h ú¿ýIR,"9	­î×ÿ¥­ÒfÎÕ?0Tþ¿cèS#Ö?<Iã5¹WBSê9ThÜI³7¹Òf áì9= htÎ²7y¬Óì Ã<{þ»)PÖ±ÞâààK"h@%¸I= á&ý·¦ÿK°ÉÑLÑL1ö1B%½%íA%½õõº&I&©jq,0¡E= D¾¬2h~yûC£ÖPUüvù~NÊÔHÁÕªT^áh=M¾ö¯Zde9¾îJ¡ÎWd³öOmøÊ¶ºÙ³IokµnãY¦ØþJTºå¾Ù?Un)Ïä®mwîAmÌFÏlµFtGî]ZÖn£Ù3¯K1;(=MDB©þÿCp?ÞïûWÐÄ!= n2$a¸Ù[T4ï6*$#,>ëx÷0Yo}ÇF¯ÂP­ö,
ó?°ò2IF[|:Öðsþ:N°´?|9üpek	ZÇ©íªâ"M´¤:¢ñ?(cð&OL×Ü
_ØbØv·ç8ñ¼fkËuiW$5?Þ!¨*ïüJGº;øc¡[§	4e]ø VniÊF7~±áÀ¨Êô¯ªÇZ^iå	XÐå
8<o]±@{Vùlµ,­tr;»Ùf´¶éÛØcsË=}Ed3Lÿ­¡â(ÃÚ´gÀ	V¦¼T'{³×<xÏ;|DogtÐ£ìyôè/3½Ôg×KH¤Â{Ât\Üû êåÒ5%3Eú¹½ÒõfüIc7¹_ÆtÍý?­ÎôÍ«­þfáÂ\SÃ­ÆÄë9dhDÖÍ¢ª­´I³5¹ü|þ¿ðf"SéyW 8¸
-03ÍR¬«P«¡AÖßÜfº~¾çÉá²³þ÷©) ÄXKXVìGØµi¥iºéª	=}×6WÃdu0Å¢Íhó··¤odëz23²;¡ö0 «uãã{moöC¨S¬a¢éAê´HWWÓEyÌ§4"ÌKé³¥i7Ð¯bÍá%=}ØM3Ü)_ÃYí¢ð/ÞÅ´ëýb%= kÌV±ÐúT¾0èûZgGV{Y ³0òê%lÞ'ÿVôua· áwý¿ÀÐ¯Ywö#g®M0=}¡ES«¶Uû+òÙªxæ¹_ÊNà]Ïÿ
Uú²ìÎÑ[áneÿ%%Wéÿn|ÊK=M±#gØµõÊûc 6Íeé(-hQf¹=Mÿ¾cÌ.°ÈÉ6£oHÜ5ìª¿¯é¹ðÅUå§+\ª0vÙ¸#Ü¤hôL½Þ-ZÑíº«îÛü´ fk%àð½~ÆK -M4=M}q5õD¢È
p4M4|^py§©S¤YÎKr4g 8Y0zû¼JKªf
ÆnÏR1ï3ríCzô7ùæ·=M\YVÞôO@	­;Ú<ÐMÈ*ÝpN×zÓÍ­°½Mú5N×OëJ=M©6«cµËBaÎao!SÂA°6«åo'Ä3Ô|À24kÐÿ(= ßlÈø\9V®Ké%TÁº"wØ[ÝÐÁ/àÍ^Í·qëÞåî¢YãÁ·à"Câ	h¢¡Õ-û(Ôu]:Þlåg$6U&}Fç)vè5l­ö_*0üÛBºvÝúû!?ÌIøªÑáF5ëà½Éz»º  *Z´;pýü9Çê£ *sã)ÃU÷Ä^¸l'<Å½2¥î©<p¤Ô¯º4r%ÂÃ\{Ëd«ÁÍ%®u3@zj¥nðæÒqÚ¾(ºx5ÊÏ´[µE5Ý4¥[¬byà=}wûç+å<ó7ù3m;ý78­näP¥p©]í+ÆrUºÕ¿L!ÃKÀÐ:^S4êZl§g=}\¥©l-¬¼}£ÜOt_x	±ÔZºéêë¨ÞOÍLÚý÷,èúrüÏá3G¥&ò#
£Å}c ~~^²ÛÌyÊò¦¤³CÓ¡³ÂniUGM¨=M8 $ø:µlFfsµðFqØ½òbB?¥kjæ4yiÕYàQî¢Ñù"Ä
iVøHF°zì¯¢ÌçÈ×öVÖä}´ég%ü±ZIf÷MÎ³,X¡·{¶Ü¡pdæ¼ím7(q>Õ+ù¢¹Õ-kEë²ÕÐëd9¤æ ÏTY±L©Ð¯q3XÕýÒíÄ-à[«¯Ä	jröÒ}>Z;é«íàæ;<ßîê3érÂ^l >b\Þo¶Ë&?à:.#:Ëk 5ì¦mó¯{ù/)ºá¬Z¯HáWþùìhÕà$Lå\Ðëh{øÛ êZb°Ñ°e0¦xaP¡ù­ö§üÎ¥EÒø
ÓAÙ8"ð¡âJðVI'*ÖWTÓM¢kú±ê÷×ç{¡°yitcøºÃ»ÏëoÈo"é÷ôdÌÍÛÙÙ"©ù;~ÉI¶Î¹F@®;bq1s3o	þ)zÝºòë-V«gÁÉæw¦= ¦ª¸øHäQïºlz 2×âZ(I!æyZ§-=Mö¶Ùê'z;ô2:­ÌM§¬½k+÷6¹ £+B
Ä¡³Ü´3\Ë_Y6½l=M=MÄËHâËÐohòÜ7ÒïGÑñ?
}2åÚ¤68á4*h>mR/hä:á=}v¶6T%Üæö*ÃºnöâXKriü("æzÞNoÞ2cG£vCgtg;·Ò©õ±ÂlzÓ¡Þ^Ù= ÜÉd	ã<«øHÓÎQâ^ÝEàÈ%<GE63:Sf¦_ºCµ©gÙýà$®87í¾ïrÀB°ª*Ä¥&Ã¤¤L¿¢®jÀ G÷0Zd?Æ^DAÚ¬d¶ÅÍÆ¼Ã&ÅfÍÐTçÌÓÎáà×Úýûöéèïò5<C>10'*=M"¥¬³®ÁÀ·º¤U\c^QPGJmtkfyx ¡Ä½¶»¨©²¯|u~pqjgTMFKXYb_ìåîó ú÷äÝÖÛÈÉÒÏ#
4-&+89B?NSLEZW= av{}rohi¾Ã¼µª§°±¢.3,%:7@A$	ÞãÜÕÊÇÐÑæëôíÿøù! ;6=}D/2)(þõüçêñðËÆÍÔßâÙØsnelwz[V]dORIH£«¦­´¿Â¹¸ÑÈ{ÕÅÕÅ
{2 »{2 3V2 {2 {2BÖËåYíUMò>jÅÙHWÎwÈ2i9J÷ÕKÅ®ÒúfcyU
ouØ7ßóþ~ÐT©S!Ltµ©AUµ×cê )áUuØ{Ñ^ÒÐ&cQJ÷Ñ!¨	ál86V®}Ú<®Ö¢Tà9øs*¿Ù$®ÜBTÆßQ¶= £ ½Õ´®i,¹ý[7ð(Ø2S:v[»ÃýÙÌ.±kâyúkÑ]Òø0æñsÊúÔ½_X%RF¦ÕZÇ¨cMX@T~ý\¹ça85ÿ²ò~b¼µL8$³ª:üª#Vp>Êô¾Y$¶¸Áä¸«ÁüÌ·DdÁR¬Ú_ü·ÿ¤LAT4¬n\½Ac¥X>épÐRwîûcÛ'_1L²kHyë (®JkT¹ÃUÂv´9Z3ØÜ±÷bi(o)Òn^úuX¿Íà"q zj[O 
rÉªh¡Û×÷1Ví
ùçÅÓ*]ãÙÝfÅEkX9W£û´r2 {2 {z x{2 {2 {·Ô¬ÉåÉèÏÅE:	ÆEâéàqF
o»gÅÐ÷ÑÃìgÅÚ}
ögÅÆíÙÅmsà-	ÙÅÝÇhÔ­ÙÅ­«Û
ögÅÆ½TíÅUGIÎß¶õÜ*ÙIë(8é_E«( óGòh>-ë{E{(ðHBh(­å»Fbh-ð;H(,æF³(ò?Gúh<­êEºh$­ôûG(Bì¿Ejh­ï[H3(*æFS(ïÿH®e+ªóÉ·M=M¬µçF|µ"gÉ$ë·MAF-dµgÌÄëMÁÈì_MÁKmµgGpµ§É4ë³MÆ´ìM$AI=}Àµ§Æì[MLµ'HÝXµ'ËJæA¡ïÎËõëÊX.)çaE°)ÖÏ<1}ËÜÑ=};VµJáKDµXáå°¦Úê ¥öÈãVluKK2uVå¤¦ÕáêD%ü¾Ó7ã+!7ÊÛX@©ëñEÄî7ÛkUæ9gëIé:ª9ZçÒ"ZõzzNI! ·::O9üw9xQ:Ä,v~8³4ûÜk|ø8?¸¸_(¼iwÓ¹9wûxº±Hp£\£$õ°H2u  Ío 4¯®
ÅDç_R[ºhÂèÂ­äºgäÂT­ú?$0¯°®àjê¹.öòt´f´X;° lòº¹ù\2/5*5\²'µU²= ²2õ(uU|jÒ»x:Ò{ÑwâÑ!'¤ýÛÑ±Ñq'²ðõUNê(÷ÅV	ç= íànìo?N>'0éß^êãN0§1ia.y,9Y&xÜx¬RQCwäx¤RsxôRQ±óB/-*-\Cö9=MÄkÒ*ÑÚ:2md£ú÷Ýd¶¦6Ý£Þ# ¶f¦_¦%ýØ*]i+xY1-W)$8f~K©!¸bA/£ùOè,ü¬¨lí.©7£8Cúß|aàR
.µìþ[þ»þSD$þþO²¶SF¶S+S¶B=}ú»÷»ÐìA}ÒÿË&ú1àL(î(MIékdèÏÅG9	ÆE¯6ì-v7¹WùöBÁSnF°-ë:ûKó^=M¢j!ã4w\·Í:êqdAiß¶3/DlÓ©§¼å:¬[?{MØ½TåýEÝÍÅÅß½-8±= ûSzþb³áÜÍæIÕÍæIÕÍæIÕÍæIÕÍæIÕÍæIµ¤x¿ûuvzx¿ò@3*rIx»ê8Ôðu.Ã%á] ]F<x(Û¦é5Æl«dÛì¿X¿ð-"ÂjlzRû 4­²)©ÊRãÝà6èÌe3AQèmÞ0EÅùoôF/ì¯ewê¬ïp×7k·æto¼gç_ÁìWA|çè³P§NMîÄP')[Vé¬mÕ:Pihùén­ßißb-c"X»].SrbC­V­_æË®RþØ,®¬±Û¡s¸7³âÿî¼²ùao@>´§àhý>ðtS­­ã	huäEÅLeáã4Ï«&ûÉxuâG0@§ü¶§Æ£¿ÞÄS }­¤õ¶ÜÃ:¥(6Á#F-PÙnÙnèÕ26ë 3m2ÞÐzþ'Xr(k¹m6. ?a[#= è|*ñ«M{Sâvv ÷Û/¸£¤µAP-¼ôk§ÙÒ	zÊËðïÎ/J¯Ïµuu{c·í77þö÷ÂÍ@éû×àc«ôÐÒ¬Ô¥èwÔ°}n¨ïí(°pÑv¥}®}ú.äèT.pi¹yP°âf­h[Ï8wU¡$êÒáxâW9¬¡Þ/þ*?Bhfþ"_Ûý0ÿ0b+1uZl{úXL/"z¿ÓôÉöe,cç®t¨Ì¯2º=Mÿõ½)Áé=}Õñ'Glùz¥Ù1í)q¥néìëÕXu,'XuÎ>Ã¯ÉÃ9éÒr®¸ð3ïð¯@ÒÚoòò°ï(dBjwrTàÏ}Ç¿Òí\â&Ö+¡ô7Ìs sèÆv³ló´ç5ÕÙòÕ¥JJb¦¤<'ö~ý~= WCZß Gò°¶¼I[¶ç¶jE§Ð¶Ð9+Y¼ß(Öäô,ÙaL¦ó¾%'ëþø~N#Q*&x·_ÂfÁj1A;»ê¢*¼A:C**#Bf¢þÎ!ö"v«Ý ±Ð©Ê2â¡fpCshÒ+wÌ ñò«þaÃÛÓÞµAÍg¾­=MEãnQEù¨WmÑ.S²î·ýéZß´ñ®úü£%¸-KI9°ùýèg^ºe÷¢p?r4Ûý kº+ÛÕ0Ógú®Aé	ô[_Æ,ó{!±Iù,»7wS°#pstë=}Ep(àiº«ºËpÚóMÙ¥¤%'Ø~V{îýIøû¬1= }Ò¢ß2{4[|å E²N²©Ó_áUHæa@u¢§39-ì|£N±lÓ}ÔmÀºÀM£¥®U¾U5Ñè33r×£ïu÷ïZ]I0Þ!ãîAz"gSqjàZËmF.9÷ÝðwíØo¦o²7ÒÏyé"®Eÿ];ìT6çL·fës£ñüæçÚ5Ì¤¹?@l*³×ÿr5<ià´¶¢ÌãéãU¼®@"­ó8>àè£4LGa)\©å·Q?¯CoMÆ´ÅÝNVã= äÐqÔ¦V½¤0¯RÀR¿=Mö5õ»?*CêyEdc¨ôAdETNT©ì¿·Æ¿<£O4<æZP ¨wo¢¤'ñ
:[÷!@²s7ÔQ«WÁÚ}÷jSbÉ%ÿJub;aæìXô$ôÎcZlï¨¬9ÜèÑ= (x1\áÜ^!{R¼Î8G©Ê½*)­÷;gmjÌ#dp Ø%7~ªCÚ³P»o¾$F$E-¿úKC¦½ê.fÃKÄrµ%=MÃW·ª=}uµ½É¢)>M¨Iº¸Y2¸XûLèÆ:Ðuµ½×¢3>F Íº¡¸K²»[;JÌhö:l³¥T¦ä^ÃH~1Ä;ÁPéndxÄ¬ÄìÁñýéÄ¾fH¦(k)±}2Q(ñ>Gg½&Gìý!qáNTÇ/ÒUöârxàMK,5qoÓl
ìnúpæ Meò[áH-<¼)÷¾,=M¦ñz\Ì£Et= ò Ï·ëª,Ü¶ÐÊæ}k!RôË³ààüeÔñÁó6¥¡«³½=}:9RßBÐÁØÁ,|v±S·T´4µ¤ÙCäÁ_ñð¦½:ÉÄÎÄ¹È±´{çLXÁàº»ÀÁ¼IÉðÚêÃâ¥X¦U¶å¿QDå£¡cÈ ³rDÙÔ´P³ÅÝÎkíI*¥.	ïN^Aóiáþ|Ó+ì|ýíÚ@ZÈ¯Ë3K|f°vÇAúvSA¢*G¡2¦N¹ãcodE¼%áCPc¨H0wÚ-Ì= &Ó²¶é°mËkK(Ins-z©8ÅCÆFÃbV\fVvHJT¦N¶pÆrÖlæföxz&~6ÃÆ½Ö·æ¹ö«¥¯&±6FVfv¦¡¶ÆÖæ#ö&6)F'V-f3vA?5¦;¶öFüVf vîôê¦è¶ÆÆÌÖÒæÐöÞäÚ&Ø6øHúXhþxðòì¨æ¸ÈÈÊØÔèÎøàâÜ(Ö8ÈØè!ø=M(	8+H%X/h1xC=}7¨9¸ÁÈ¿Øµè»ø©§­(³8HXhx¨£¸^HdXZhXxFLR¨P¸nÈtØjèhøv|(8mÇs×içg÷u{'7]GcWYgWwEKQ§O·GWgw§¤·ÂÇÀ×¶ç¼÷ª¨®'´7,G&W0g2wD>8§:·Ç× ç"÷'
7ÇÇÉ×ÓçÍ÷ßáÛ'Õ7÷GùWgýwïñë§å·(%½¬µ´ ÄÄÝÝÝÁÞE|ò6øÇ§¼ÅîËÐ¡1ÑÕÓ×wGJ¶TÛüDåÅS-8øàmËÅÅ`});

var UTF8Decoder = new TextDecoder("utf8");

function UTF8ArrayToString(heap, idx, maxBytesToRead) {
 var endIdx = idx + maxBytesToRead;
 var endPtr = idx;
 while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr;
 return UTF8Decoder.decode(heap.subarray ? heap.subarray(idx, endPtr) : new Uint8Array(heap.slice(idx, endPtr)));
}

function UTF8ToString(ptr, maxBytesToRead) {
 if (!ptr) return "";
 var maxPtr = ptr + maxBytesToRead;
 for (var end = ptr; !(end >= maxPtr) && HEAPU8[end]; ) ++end;
 return UTF8Decoder.decode(HEAPU8.subarray(ptr, end));
}

var HEAP8, HEAP16, HEAP32, HEAPU8, HEAPU16, HEAPU32, HEAPF32, HEAPF64;

var wasmMemory, buffer, wasmTable;

function updateGlobalBufferAndViews(b) {
 buffer = b;
 HEAP8 = new Int8Array(b);
 HEAP16 = new Int16Array(b);
 HEAP32 = new Int32Array(b);
 HEAPU8 = new Uint8Array(b);
 HEAPU16 = new Uint16Array(b);
 HEAPU32 = new Uint32Array(b);
 HEAPF32 = new Float32Array(b);
 HEAPF64 = new Float64Array(b);
}

function _emscripten_memcpy_big(dest, src, num) {
 HEAPU8.copyWithin(dest, src, src + num);
}

function abortOnCannotGrowMemory(requestedSize) {
 abort("OOM");
}

function _emscripten_resize_heap(requestedSize) {
 var oldSize = HEAPU8.length;
 requestedSize = requestedSize >>> 0;
 abortOnCannotGrowMemory(requestedSize);
}

var SYSCALLS = {
 mappings: {},
 buffers: [ null, [], [] ],
 printChar: function(stream, curr) {
  var buffer = SYSCALLS.buffers[stream];
  if (curr === 0 || curr === 10) {
   (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
   buffer.length = 0;
  } else {
   buffer.push(curr);
  }
 },
 varargs: undefined,
 get: function() {
  SYSCALLS.varargs += 4;
  var ret = HEAP32[SYSCALLS.varargs - 4 >> 2];
  return ret;
 },
 getStr: function(ptr) {
  var ret = UTF8ToString(ptr);
  return ret;
 },
 get64: function(low, high) {
  return low;
 }
};

function _fd_close(fd) {
 return 0;
}

function _fd_read(fd, iov, iovcnt, pnum) {
 var stream = SYSCALLS.getStreamFromFD(fd);
 var num = SYSCALLS.doReadv(stream, iov, iovcnt);
 HEAP32[pnum >> 2] = num;
 return 0;
}

function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {}

var asmLibraryArg = {
 "d": _emscripten_memcpy_big,
 "c": _emscripten_resize_heap,
 "b": _fd_close,
 "a": _fd_read,
 "e": _fd_seek
};

function initRuntime(asm) {
 asm["g"]();
}

var imports = {
 "a": asmLibraryArg
};

var _free, _malloc, _create_decoder, _destroy_decoder, _decode_frame;


this.setModule = (data) => {
  WASMAudioDecoderCommon.setModule(EmscriptenWASM, data);
};

this.getModule = () =>
  WASMAudioDecoderCommon.getModule(EmscriptenWASM);

this.instantiate = () => {
  this.getModule().then((wasm) => WebAssembly.instantiate(wasm, imports)).then((instance) => {
    var asm = instance.exports;
 _free = asm["h"];
 _malloc = asm["i"];
 _create_decoder = asm["j"];
 _destroy_decoder = asm["k"];
 _decode_frame = asm["l"];
 wasmTable = asm["m"];
 wasmMemory = asm["f"];
 updateGlobalBufferAndViews(wasmMemory.buffer);
 initRuntime(asm);
 ready();
});

this.ready = new Promise(resolve => {
 ready = resolve;
}).then(() => {
 this.HEAP = buffer;
 this._malloc = _malloc;
 this._free = _free;
 this._create_decoder = _create_decoder;
 this._destroy_decoder = _destroy_decoder;
 this._decode_frame = _decode_frame;
});
return this;
}}