(function () {
'use strict';

var FR = document.documentElement.lang === 'fr';
function tr(e, f) { return FR ? f : e; }
function nf(x, d) { var t = d == null ? String(x) : x.toFixed(d); return FR ? t.replace('.', ',') : t; }

/* =====================================================================
   DATA — every value carries its source in SRC below.
   legal: 'L' legal (UK + FR), 'I' controlled, 'R' prescribed medicine
   ===================================================================== */
var DRUGS = [
  // id, name, legal, nutt10 [total, users, others], nutt07 [phys, dep, soc], safety ratio, capture rate (%), capture class, UK status
  { id:'alcohol',  n:tr('alcohol','alcool'), lg:'L', m:[72,26,46], n7:[1.40,1.93,2.21], sr:10,   cap:15.4, uk:'legal' },
  { id:'heroin',   n:tr('heroin','héroïne'), lg:'I', m:[55,34,21], n7:[2.78,3.00,2.54], sr:6,    cap:23.1, uk:'A' },
  { id:'crack',    n:tr('crack cocaine','crack'), lg:'I', m:[54,37,17], n7:null,             sr:null, cap:null, uk:'A' },
  { id:'meth',     n:tr('methamphetamine','méthamphétamine'), lg:'I', m:[33,32,1],  n7:null,             sr:10, cap:null, uk:'A' },
  { id:'cocaine',  n:tr('cocaine','cocaïne'), lg:'I', m:[27,19.5,7.5], n7:[2.33,2.39,2.17], sr:15,   cap:16.7, uk:'A' },
  { id:'tobacco',  n:tr('tobacco','tabac'), lg:'L', m:[26,17,9],  n7:[1.24,2.21,1.42], sr:null, cap:31.9, uk:'legal' },
  { id:'amph',     n:tr('amphetamine','amphétamine'), lg:'I', m:[23,19,4],  n7:[1.81,1.67,1.50], sr:null, cap:11.2, capc:'stimulants', uk:'B' },
  { id:'cannabis', n:'cannabis',           lg:'I', m:[20,12,8],  n7:[0.99,1.51,1.50], sr:1000, cap:9.1,  uk:'B' },
  { id:'ghb',      n:'GHB',                lg:'I', m:[19,18,1],  n7:[0.86,1.19,1.30], sr:8,    cap:null, uk:'B' },
  { id:'benzo',    n:tr('benzodiazepines','benzodiazépines'), lg:'R', m:[15,12.5,2.5], n7:[1.63,1.83,1.65], sr:null, cap:9.2,  capc:tr('anxiolytics','anxiolytiques'), uk:'C' },
  { id:'ketamine', n:tr('ketamine','kétamine'), lg:'I', m:[15,13,2],  n7:[2.00,1.54,1.69], sr:38, cap:null, uk:'B' },
  { id:'methadone',n:tr('methadone','méthadone'), lg:'R', m:[14,11.5,2.5], n7:[1.86,2.08,1.87], sr:20,   cap:null, uk:'A' },
  { id:'meph',     n:tr('mephedrone','méphédrone'), lg:'I', m:[13,12,0.5], n7:null,             sr:null, cap:null, uk:'B' },
  { id:'butane',   n:'butane',             lg:'L', m:[11,10,0.5], n7:[1.28,1.01,1.52], sr:null, cap:3.7,  capc:tr('inhalants','solvants'), uk:'legal', n7name:tr('solvents','solvants') },
  { id:'khat',     n:'khat',               lg:'I', m:[9,8.5,0.5], n7:[0.50,1.04,0.85], sr:null, cap:null, uk:'C' },
  { id:'steroids', n:tr('anabolic steroids','stéroïdes anabolisants'), lg:'R', m:[10,8.5,1],  n7:[1.45,0.88,1.13], sr:null, cap:null, uk:'C' },
  { id:'mdma',     n:'ecstasy (MDMA)',     lg:'I', m:[9,8.5,0.5], n7:[1.05,1.13,1.09], sr:16,   cap:null, uk:'A' },
  { id:'lsd',      n:'LSD',                lg:'I', m:[7,7,0],     n7:[1.13,1.23,1.32], sr:1000, cap:4.9,  capc:tr('psychedelics','psychédéliques'), uk:'A' },
  { id:'bupe',     n:tr('buprenorphine','buprénorphine'), lg:'R', m:[7,5.5,1],   n7:[1.60,1.64,1.49], sr:null, cap:null, uk:'C' },
  { id:'shrooms',  n:tr('magic mushrooms','psilocybes'), lg:'I', m:[6,5,0.5], n7:null, sr:1000, cap:4.9, capc:tr('psychedelics','psychédéliques'), uk:'A' }
];
// drugs only in the 2007 scale (no 2010 score)
var EXTRA07 = [
  { id:'barb', n:tr('barbiturates','barbituriques'), lg:'R', n7:[2.23,2.01,2.00] },
  { id:'mta',  n:'4-MTA', lg:'I', n7:[1.44,1.30,1.06] },
  { id:'mph',  n:tr('methylphenidate','méthylphénidate'), lg:'R', n7:[1.32,1.25,0.97] },
  { id:'nitrites', n:tr('alkyl nitrites','poppers (nitrites)'), lg:'L', n7:[0.93,0.87,0.97] }
];
// Gable safety ratios (lethal / effective dose), incl. substances not in the MCDA list
var SAFETY = [
  { n:tr('heroin (injected)','héroïne (injectée)'), v:6, lg:'I' },
  { n:'GHB', v:8, lg:'I' },
  { n:tr('alcohol','alcool'), v:10, lg:'L', note:tr('330 g of alcohol vs a 33 g effective dose','330 g d’alcool pur, contre 33 g pour l’effet recherché') },
  { n:tr('methamphetamine','méthamphétamine'), v:10, lg:'I' },
  { n:tr('cocaine (snorted)','cocaïne (sniffée)'), v:15, lg:'I' },
  { n:'MDMA', v:16, lg:'I' },
  { n:tr('codeine','codéine'), v:20, lg:'R' },
  { n:tr('methadone','méthadone'), v:20, lg:'R' },
  { n:tr('mescaline','mescaline'), v:24, lg:'I', note:tr('marked uncertain in the source','valeur jugée incertaine par l’auteur') },
  { n:tr('ketamine (snorted)','kétamine (sniffée)'), v:38, lg:'I', note:tr('marked uncertain in the source','valeur jugée incertaine par l’auteur') },
  { n:tr('fluoxetine (Prozac)','fluoxétine (Prozac)'), v:100, lg:'R', note:tr('an antidepressant, for comparison','un antidépresseur, pour comparaison') },
  { n:tr('nitrous oxide','protoxyde d’azote'), v:150, lg:'L', note:tr('>150 in the source','>150 dans la source') },
  { n:'LSD', v:1000, lg:'I', note:tr('extrapolated: no well-documented human lethal dose','extrapolé : aucune dose mortelle bien documentée chez l’humain') },
  { n:tr('psilocybin','psilocybine'), v:1000, lg:'I', note:tr('extrapolated','extrapolé') },
  { n:'cannabis', v:1000, gt:true, lg:'I', note:tr('no lethal dose established; ratio shown as >1000','aucune dose mortelle établie ; affiché comme >1000') }
];
// Anthony, Warner & Kessler 1994 — % of ever-users who developed dependence
var CAPTURE = [
  { n:tr('tobacco','tabac'), v:31.9, lg:'L' }, { n:tr('heroin','héroïne'), v:23.1, lg:'I' }, { n:tr('cocaine','cocaïne'), v:16.7, lg:'I' },
  { n:tr('alcohol','alcool'), v:15.4, lg:'L' }, { n:'stimulants', v:11.2, lg:'I', s:tr('other than cocaine','hors cocaïne') },
  { n:tr('anxiolytics','anxiolytiques'), v:9.2, lg:'R', s:tr('sedatives, hypnotics','sédatifs, somnifères') }, { n:'cannabis', v:9.1, lg:'I' },
  { n:tr('analgesics','antalgiques'), v:7.5, lg:'R', s:tr('opioid painkillers','antidouleurs opioïdes') }, { n:tr('psychedelics','psychédéliques'), v:4.9, lg:'I' },
  { n:tr('inhalants','solvants'), v:3.7, lg:'L' }
];
// Lopez-Quintero et al. 2011 — lifetime cumulative probability of dependence
var LIFETIME = [
  { n:'nicotine', v:67.5, lg:'L' }, { n:tr('alcohol','alcool'), v:22.7, lg:'L' },
  { n:tr('cocaine','cocaïne'), v:20.9, lg:'I' }, { n:'cannabis', v:8.9, lg:'I' }
];
// users worldwide, millions
var USERS = [
  { n:tr('alcohol (current drinkers)','alcool (buveurs)'), v:2500, lg:'L', src:'s-whoalc' },
  { n:tr('tobacco','tabac'), v:1200, lg:'L', src:'s-whotob' },
  { n:'cannabis',                   v:256,  lg:'I', src:'s-unodc' },
  { n:tr('opioids (incl. non-medical use of painkillers)','opioïdes (y compris antidouleurs détournés)'), v:63, lg:'I', src:'s-unodc' },
  { n:tr('amphetamines','amphétamines'), v:32,   lg:'I', src:'s-unodc' },
  { n:tr('cocaine','cocaïne'), v:25,   lg:'I', src:'s-unodc' },
  { n:'ecstasy',                    v:21,   lg:'I', src:'s-unodc' }
];
// deaths per year
var DEATHS = {
  world: { items:[ { n:tr('tobacco','tabac'), v:7000000, lg:'L' }, { n:tr('alcohol','alcool'), v:2600000, lg:'L' },
                   { n:tr('all illegal drugs','drogues illicites'), v:600000, lg:'I' } ],
           note:FR ? 'OMS : tabac &gt;7 millions de morts par an, dont &gt;1,6 million de non-fumeurs exposés au tabagisme passif<sup class="ref"><a href="#s-whotob">8</a></sup> ; alcool 2,6 millions et drogues 0,6 million en 2019<sup class="ref"><a href="#s-whoalc">9</a></sup>. Près de 80 % des décès liés aux drogues concernent les opioïdes, en comptant le VIH, l’hépatite C et les maladies du foie autant que les ≈125 000 overdoses<sup class="ref"><a href="#s-whoop">21</a></sup>.' : 'WHO: tobacco &gt;7 million a year, of which &gt;1.6 million are non-smokers exposed to second-hand smoke<sup class="ref"><a href="#s-whotob">8</a></sup>; alcohol 2.6 million and drug use 0.6 million in 2019<sup class="ref"><a href="#s-whoalc">9</a></sup>. Close to 80 % of drug deaths are opioid-related, counting HIV, hepatitis C and liver disease as well as ≈125,000 overdoses<sup class="ref"><a href="#s-whoop">21</a></sup>.' },
  fr:    { items:[ { n:tr('tobacco','tabac'), v:75000, lg:'L' }, { n:tr('alcohol','alcool'), v:41000, lg:'L' },
                   { n:tr('drug-induced deaths (2022)','décès par overdose (2022)'), v:638, lg:'I' } ],
           note:FR ? 'Santé publique France : 75 320 décès attribuables au tabac et ≈41 000 à l’alcool (estimations 2015)<sup class="ref"><a href="#s-spf">11</a></sup>. 638 décès en 2022 directement causés par des drogues illicites ou des médicaments détournés, avec des opioïdes dans 78 % des cas ; ce comptage toxicologique (DRAMES/DTA) en manque une partie, et Kopp attribue ≈1 230 décès par an aux drogues illicites<sup class="ref"><a href="#s-ofdt">17</a></sup><sup class="ref"><a href="#s-kopp">16</a></sup>.' : 'Santé publique France: 75,320 tobacco and ≈41,000 alcohol-attributable deaths (2015 estimates)<sup class="ref"><a href="#s-spf">11</a></sup>. 638 deaths in 2022 directly caused by illicit drugs or misused medicines, opioids involved in 78 %; this toxicology-based count (DRAMES/DTA) misses some cases, and Kopp attributes ≈1,230 deaths a year to illicit drugs<sup class="ref"><a href="#s-ofdt">17</a></sup><sup class="ref"><a href="#s-kopp">16</a></sup>.' },
  us:    { items:[ { n:tr('tobacco','tabac'), v:480000, lg:'L' }, { n:tr('alcohol','alcool'), v:178000, lg:'L' },
                   { n:tr('drug overdoses (2023)','overdoses (2023)'), v:105007, lg:'I' } ],
           note:FR ? 'CDC : ≈480 000 décès liés au tabac, ≈178 000 à l’alcool (2020–21) et 105 007 décès par overdose en 2023 (pic de 107 941 en 2022), puis 79 384 en 2024 (définitif) et ≈70 000 en 2025 (provisoire)<sup class="ref"><a href="#s-cdc">12</a></sup>. Les États-Unis sont l’exception : les opioïdes illicites y tuent dans le même ordre de grandeur que l’alcool.' : 'CDC: ≈480,000 smoking-related deaths, ≈178,000 alcohol-attributable deaths (2020–21) and 105,007 overdose deaths in 2023 (peak 107,941 in 2022), falling to 79,384 in 2024 (final) and ≈70,000 in 2025 (provisional)<sup class="ref"><a href="#s-cdc">12</a></sup>. US overdoses are the exception: there illegal opioids kill on the same order as alcohol.' }
};
// France, € billions per year (Kopp 2023, data for 2019)
var MONEY = [
  { n:tr('tobacco','tabac'), cost:156, tax:13.1, lg:'L' },
  { n:tr('alcohol','alcool'), cost:102, tax:4.0,  lg:'L' },
  { n:tr('illegal drugs','drogues illicites'), cost:7.7, tax:0, lg:'I' }
];

var SRC = [
  ['s-nutt10','Nutt DJ, King LA, Phillips LD (2010). Drug harms in the UK: a multicriteria decision analysis. <i>Lancet</i> 376:1558–65.','https://doi.org/10.1016/S0140-6736(10)61462-6'],
  ['s-nutt07','Nutt D, King LA, Saulsbury W, Blakemore C (2007). Development of a rational scale to assess the harm of drugs of potential misuse. <i>Lancet</i> 369:1047–53.','https://doi.org/10.1016/S0140-6736(07)60464-4'],
  ['s-amst15','van Amsterdam J, Nutt D, Phillips L, van den Brink W (2015). European rating of drug harms. <i>J Psychopharmacol</i> 29:655–60.','https://doi.org/10.1177/0269881115581980'],
  ['s-gable','Gable RS (2004). Comparison of acute lethal toxicity of commonly abused psychoactive substances. <i>Addiction</i> 99:686–96; and Gable RS (2006). The toxicity of recreational drugs. <i>American Scientist</i> 94:206–8.','https://doi.org/10.1111/j.1360-0443.2004.00744.x'],
  ['s-moe','Lachenmeier DW, Rehm J (2015). Comparative risk assessment of alcohol, tobacco, cannabis and other illicit drugs using the margin of exposure approach. <i>Scientific Reports</i> 5:8126.','https://doi.org/10.1038/srep08126'],
  ['s-anth94','Anthony JC, Warner LA, Kessler RC (1994). Comparative epidemiology of dependence on tobacco, alcohol, controlled substances, and inhalants: basic findings from the National Comorbidity Survey. <i>Exp Clin Psychopharmacol</i> 2:244–68.','https://doi.org/10.1037/1064-1297.2.3.244'],
  ['s-lq11','Lopez-Quintero C, Pérez de los Cobos J, Hasin DS et al. (2011). Probability and predictors of transition from first use to dependence on nicotine, alcohol, cannabis, and cocaine: results of the NESARC. <i>Drug Alcohol Depend</i> 115:120–30.','https://doi.org/10.1016/j.drugalcdep.2010.11.004'],
  ['s-whotob','World Health Organization (2026). Tobacco and nicotine, fact sheet.','https://www.who.int/news-room/fact-sheets/detail/tobacco'],
  ['s-whoalc','World Health Organization (2024). Global status report on alcohol and health and treatment of substance use disorders; news release 25 June 2024, "Over 3 million annual deaths due to alcohol and drug use".','https://www.who.int/news/item/25-06-2024-over-3-million-annual-deaths-due-to-alcohol-and-drug-use-majority-among-men'],
  ['s-unodc','UNODC (2026). World Drug Report 2026 (data for 2024).','https://www.unodc.org/unodc/en/wdr/2026/'],
  ['s-spf','Bonaldi C, Boussac M, Nguyen-Thanh V (2019). Estimation du nombre de décès attribuables au tabagisme en France de 2000 à 2015. <i>BEH</i> 15:278–84; Bonaldi C, Hill C (2019). La mortalité attribuable à l’alcool en France en 2015. <i>BEH</i> 5-6:97–108.','https://beh.santepubliquefrance.fr/beh/2019/15/2019_15_2.html'],
  ['s-cdc','CDC: smoking-attributable mortality (2014 Surgeon General report); Esser MB et al. (2024) <i>MMWR</i> 73:154–61 (alcohol deaths 2020–21); NCHS Data Brief 549 (drug overdose deaths 2023–2024).','https://www.cdc.gov/nchs/products/databriefs/db549.htm'],
  ['s-gcdp','Global Commission on Drug Policy (2019). Classification of psychoactive substances: when science was left behind.','https://www.globalcommissionondrugs.org/reports/classification-psychoactive-substances'],
  ['s-equasy','Nutt DJ (2009). Equasy — an overlooked addiction with implications for the current debate on drug harms. <i>J Psychopharmacol</i> 23:3–5.','https://doi.org/10.1177/0269881108099672'],
  ['s-sack','BBC News (30 Oct 2009). Government drug adviser sacked; and Nature Medicine (2009) 15:1337.','http://news.bbc.co.uk/2/hi/uk_news/8333240.stm'],
  ['s-kopp','Kopp P (2023). Le coût social des drogues en France (données 2019). OFDT note; earlier edition: Kopp P (2015), OFDT Note 2015-04 (data for 2010).','https://www.ofdt.fr/BDD/publications/docs/eisxpk2d7.pdf'],
  ['s-ofdt','OFDT (2025). Drogues et addictions, chiffres clés 2025 (Baromètre santé 2023; DRAMES/DTA deaths 2022).','https://www.ofdt.fr/sites/ofdt/files/2025-07/dacc_2025.pdf'],
  ['s-pt','Transform Drug Policy Foundation (2021). Drug decriminalisation in Portugal: setting the record straight (EMCDDA/ECDC data); Hughes CE, Stevens A (2010). What can we learn from the Portuguese decriminalization of illicit drugs? <i>Br J Criminol</i> 50:999–1022.','https://doi.org/10.1093/bjc/azq038'],
  ['s-psy','TGA Australia (2023). MDMA and psilocybin access from 1 July 2023; US FDA complete response letter to Lykos Therapeutics (9 Aug 2024); Compass Pathways COMP005/COMP006 phase 3 results (2025–26, company releases).','https://www.tga.gov.au/news/news-articles/update-mdma-and-psilocybin-access-and-safeguards-1-july-2023'],
  ['s-caulkins','Caulkins JP, Reuter P, Coulson C (2011). Basing drug scheduling decisions on scientific ranking of harmfulness: false promise from false premises. <i>Addiction</i> 106:1886–90.','https://doi.org/10.1111/j.1360-0443.2011.03461.x'],
  ['s-whoop','World Health Organization (2025). Opioid overdose, fact sheet.','https://www.who.int/news-room/fact-sheets/detail/opioid-overdose'],
  ['s-goldstein','Goldstein PJ (1985). The drugs/violence nexus: a tripartite conceptual framework. <i>Journal of Drug Issues</i> 15:493–506.','https://doi.org/10.1177/002204268501500406'],
  ['s-mvc','Ministère de l’Intérieur, Délégation aux victimes (2025). Étude nationale sur les morts violentes au sein du couple 2024.','https://www.vie-publique.fr/files/rapport/pdf/300372.pdf'],
  ['s-ipv','Tanyos A et al. (2026). Perpetrator alcohol use and intimate partner violence in high-income countries: a systematic review and meta-analysis. <i>Addiction</i>; Cafferky BM et al. (2018). Substance use and intimate partner violence: a meta-analytic review. <i>Psychology of Violence</i> 8:110–31; Moore TM et al. (2008) <i>Clin Psychol Rev</i> 28:247–74.','https://doi.org/10.1111/add.70540'],
  ['s-kids','Lipari RN, Van Horn SL (2017). Children living with parents who have a substance use disorder. SAMHSA CBHSQ Report; US AFCARS Report #30 (FY2022).','https://www.samhsa.gov/data/sites/default/files/report_3223/ShortReport-3223.html'],
  ['s-abbey','Abbey A, Zawacki T, Buck PO, Clinton AM, McAuslan P (2001). Alcohol and sexual assault. <i>Alcohol Research &amp; Health</i> 25:43–51.','https://pmc.ncbi.nlm.nih.gov/articles/PMC4484576/'],
  ['s-ansm','ANSM / CEIP-A Paris (2026). Soumission chimique : résultats de l’enquête 2024.','https://ansm.sante.fr/uploads/2026/07/10/20260710-plaquette-sc-2024.pdf'],
  ['s-mazan','Mazan rape trial, Avignon criminal court verdict, 19 December 2024 (press coverage: Euronews, Al Jazeera).','https://www.euronews.com/'],
  ['s-onisr','ONISR (2025). La sécurité routière en France, bilan 2024.','https://www.onisr.securite-routiere.gouv.fr/'],
  ['s-roadmeta','Rogeberg O, Elvik R (2016). The effects of cannabis intoxication on motor vehicle collision revisited and revised. <i>Addiction</i> 111:1348–59; correction Rogeberg, Elvik &amp; White (2018).','https://doi.org/10.1111/add.13347'],
  ['s-who18','World Health Organization (2018). Global status report on alcohol and health 2018 (alcohol-attributable fractions, Fig. 4.5; Box 1.7).','https://www.who.int/publications/i/item/9789241565639'],
  ['s-fasd','Lange S et al. (2017). Global prevalence of fetal alcohol spectrum disorder among children and youth. <i>JAMA Pediatrics</i> 171:948–56; Santé publique France (2018), press release on fetal alcohol syndrome; Enquête nationale périnatale 2021 (Inserm/SpF); Hirai AH et al. (2021). <i>JAMA</i> 325:146–55.','https://doi.org/10.1001/jamapediatrics.2017.1919'],
  ['s-diforti','Di Forti M et al. (2019). The contribution of cannabis use to variation in the incidence of psychotic disorder across Europe (EU-GEI). <i>Lancet Psychiatry</i> 6:427–36.','https://doi.org/10.1016/S2215-0366(19)30048-3'],
  ['s-meth','Lecomte T et al. (2018). The prevalence of substance-induced psychotic disorder in methamphetamine misusers: a meta-analysis. <i>Psychiatry Research</i> 268:189–92.','https://doi.org/10.1016/j.psychres.2018.05.033'],
  ['s-carb','Carbonaro TM et al. (2016). Survey study of challenging experiences after ingesting psilocybin mushrooms. <i>J Psychopharmacol</i> 30:1268–78; Baggott MJ et al. (2011). <i>Drug Alcohol Depend</i> 114:61–7 (HPPD).','https://doi.org/10.1177/0269881116662634'],
  ['s-coke','Mittleman MA et al. (1999). Triggering of myocardial infarction by cocaine. <i>Circulation</i> 99:2737–41.','https://doi.org/10.1161/01.CIR.99.21.2737'],
  ['s-hri','Harm Reduction International (2026). The Death Penalty for Drug Offences: Global Overview 2025.','https://hri.global/'],
  ['s-hrc','UN Human Rights Council (2021). Arbitrary detention relating to drug policies, A/HRC/47/40.','https://undocs.org/A/HRC/47/40'],
  ['s-aclu','ACLU (2020). A Tale of Two Countries: Racially Targeted Arrests in the Era of Marijuana Reform.','https://www.aclu.org/publications/tale-two-countries-racially-targeted-arrests-era-marijuana-reform'],
  ['s-ph','Human Rights Watch (2026), Philippines; International Criminal Court, Situation in the Philippines (Duterte arrest 11 March 2025; confirmation of charges April 2026).','https://www.hrw.org/'],
  ['s-env','UNODC World Drug Report 2022–2023 (environmental impact chapters); EMCDDA/Europol EU Drug Markets reports.','https://www.unodc.org/unodc/en/data-and-analysis/world-drug-report-2023.html'],
  ['s-tob','DGDDI (French customs) study on tobacco purchases outside the licensed network (2025, 2023 data); KPMG for Philip Morris International, illicit tobacco in Europe (2026).','https://www.douane.gouv.fr/'],
  ['s-mexico','INEGI homicide statistics 2024; Human Rights Watch World Report 2026 (Mexico); National Registry of Missing Persons (RNPDNO); DEA National Drug Threat Assessment 2025.','https://www.inegi.org.mx/'],
  ['s-colombia','UNODC/SIMCI coca survey Colombia 2023; Human Rights Watch World Report 2026 (Colombia).','https://www.unodc.org/'],
  ['s-ecuador','InSight Crime homicide round-ups 2023–2025; Executive Decree 111 (9 January 2024); Europol.','https://insightcrime.org/'],
  ['s-brazil','InSight Crime 2025 homicide round-up; press coverage of the 28 October 2025 Rio police operation.','https://insightcrime.org/'],
  ['s-europe','Port of Antwerp-Bruges and Dutch Public Prosecution Service (OM) seizure figures 2025; Belgian federal police (Brussels shootings); Swedish Police Authority shooting statistics.','https://www.om.nl/'],
  ['s-france','Ministère de l’Intérieur (Feb 2025) narcotrafic violence figures; Sénat, rapport n°588 (2024) « Un nécessaire sursaut : sortir du piège du narcotrafic »; loi n°2025-532 du 13 juin 2025.','https://www.senat.fr/rap/r23-588-1/r23-588-1.html'],
  ['s-captagon','World Bank (2025), Syria Captagon economy estimates; US Treasury / UK sanctions on Captagon trade (March 2023).','https://www.worldbank.org/'],
  ['s-opium','UNODC Afghanistan and Myanmar opium surveys 2023–2025 (via UN News).','https://news.un.org/']
];

/* =====================================================================
   helpers
   ===================================================================== */
var NS = 'http://www.w3.org/2000/svg';
var COL = { L:'#ffb454', I:'#b48ce8', R:'#8ceedd' };
var COL2 = { L:'#ffd98a', I:'#e0c3fc', R:'#c8fff4' };
var LGNAME = { L:tr('legal','légal'), I:tr('controlled','illégal'), R:tr('prescription medicine','médicament sur ordonnance') };
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, attrs, parent, text) {
  var e = document.createElementNS(NS, tag);
  for (var k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
function clear(s) { while (s.firstChild) s.removeChild(s.firstChild); }
function fmt(n) { return n.toLocaleString(FR ? 'fr-FR' : 'en-US'); }

var tip = document.getElementById('tip');
function showTip(ev, html) {
  tip.innerHTML = html; tip.classList.add('on');
  var x = ev.clientX + 14, y = ev.clientY + 14;
  var w = tip.offsetWidth, h = tip.offsetHeight;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
  if (y + h > window.innerHeight - 8) y = ev.clientY - h - 14;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideTip() { tip.classList.remove('on'); }
function hoverable(node, htmlFn) {
  node.classList.add('hov');
  node.addEventListener('mousemove', function (ev) { showTip(ev, htmlFn()); });
  node.addEventListener('mouseleave', hideTip);
  node.addEventListener('touchstart', function (ev) { var t = ev.touches[0]; showTip(t, htmlFn()); }, { passive:true });
}

function onVisible(node, fn) {
  if (!('IntersectionObserver' in window) || reduced) { fn(); return; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { fn(); io.disconnect(); } });
  }, { threshold:0.25 });
  io.observe(node);
}

/* sources list + numbering (order of SRC = reference numbers) */
(function () {
  var ol = document.getElementById('srcList');
  SRC.forEach(function (s) {
    var li = document.createElement('li');
    li.id = s[0];
    li.innerHTML = s[1] + ' <a href="' + s[2] + '" rel="noopener">' + tr('link', 'lien') + '</a>';
    ol.appendChild(li);
  });
  var idx = {}; SRC.forEach(function (s, i) { idx[s[0]] = i + 1; });
  // renumber inline refs from the href so text and list cannot drift
  function renumber(root) {
    Array.prototype.forEach.call(root.querySelectorAll('sup.ref a'), function (a) {
      var id = a.getAttribute('href').slice(1);
      if (idx[id]) a.textContent = idx[id];
    });
  }
  renumber(document);
  window.__renumber = renumber;
})();

/* =====================================================================
   hero strip
   ===================================================================== */
(function () {
  var s = document.getElementById('heroStrip');
  var sorted = DRUGS.slice().sort(function (a, b) { return b.m[0] - a.m[0]; });
  var bw = 640 / sorted.length;
  sorted.forEach(function (d, i) {
    var h = d.m[0] / 72 * 100;
    var r = el('rect', { x:i * bw + 2, y:110, width:bw - 4, height:0, rx:2, fill:COL[d.lg] }, s);
    r.style.transition = 'y .9s cubic-bezier(.2,.8,.2,1) ' + (i * 40) + 'ms, height .9s cubic-bezier(.2,.8,.2,1) ' + (i * 40) + 'ms';
    hoverable(r, function () { return '<b>' + d.n + '</b><span class="d">' + tr('overall harm ', 'nocivité totale : ') + d.m[0] + '/100 · ' + LGNAME[d.lg] + '</span>'; });
    var go = function () { r.setAttribute('y', 110 - h); r.setAttribute('height', h); };
    if (reduced) go(); else requestAnimationFrame(function () { requestAnimationFrame(go); });
  });
  el('line', { x1:0, x2:640, y1:110.5, y2:110.5, class:'axl' }, s);
})();

/* =====================================================================
   1. MCDA bars
   ===================================================================== */
(function () {
  var s = document.getElementById('mcda');
  var L = 170, R = 820, top = 22, rowH = 26;
  var xs = function (v) { return L + v / 80 * (R - L); };
  [0, 20, 40, 60, 80].forEach(function (v) {
    el('line', { x1:xs(v), x2:xs(v), y1:top - 6, y2:top + rowH * 20, class:'gridl' }, s);
    el('text', { x:xs(v), y:top - 10, class:'ax', 'text-anchor':'middle' }, s, v);
  });
  var rows = {};
  DRUGS.forEach(function (d) {
    var g = el('g', { class:'row-g' }, s);
    el('text', { x:L - 10, y:rowH / 2 + 4, 'text-anchor':'end', class:'lbl', fill:COL2[d.lg] }, g, d.n);
    el('circle', { cx:12, cy:rowH / 2, r:4, fill:COL[d.lg] }, g);
    var u = el('rect', { class:'bar', x:L, y:4, height:rowH - 8, width:0, rx:2, fill:COL[d.lg] }, g);
    var o = el('rect', { class:'bar', x:L, y:4, height:rowH - 8, width:0, rx:2, fill:COL[d.lg], opacity:.35 }, g);
    var t = el('text', { x:L, y:rowH / 2 + 4, class:'small' }, g, '');
    hoverable(g, function () {
      return '<b>' + d.n + '</b>' + tr('total ', 'total : ') + d.m[0] + ' / 100<br><span class="d">' + tr('to the user ', 'pour l’usager : ') + nf(d.m[1]) +
             tr(' · to others ', ' · pour les autres : ') + nf(d.m[2]) + '<br>' + LGNAME[d.lg] + (d.uk !== 'legal' ? tr(' · UK class ', ' · Royaume-Uni : classe ') + d.uk : '') + '</span>';
    });
    rows[d.id] = { g:g, u:u, o:o, t:t, d:d };
  });
  function layout(mode) {
    var key = { total:0, users:1, others:2 }[mode];
    var order = DRUGS.slice().sort(function (a, b) { return b.m[key] - a.m[key] || b.m[0] - a.m[0]; });
    order.forEach(function (d, i) {
      var r = rows[d.id];
      r.g.style.transform = 'translate(0px,' + (top + i * rowH) + 'px)';
      var uw = xs(d.m[1]) - L, ow = xs(d.m[2]) - L;
      if (mode === 'total')      { r.u.setAttribute('width', uw); r.o.setAttribute('x', L + uw); r.o.setAttribute('width', ow); }
      else if (mode === 'users') { r.u.setAttribute('width', uw); r.o.setAttribute('x', L + uw); r.o.setAttribute('width', 0); }
      else                       { r.u.setAttribute('width', 0);  r.o.setAttribute('x', L);      r.o.setAttribute('width', ow); }
      var v = d.m[key];
      var end = mode === 'others' ? L + ow : (mode === 'users' ? L + uw : L + uw + ow);
      r.t.setAttribute('x', end + 6); r.t.textContent = nf(v);
    });
  }
  onVisible(s, function () { layout('total'); });
  // place rows before reveal so they don't fly in from y=0
  DRUGS.slice().sort(function (a, b) { return b.m[0] - a.m[0]; }).forEach(function (d, i) {
    rows[d.id].g.style.transform = 'translate(0px,' + (top + i * rowH) + 'px)';
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-sort]'), function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-sort]').forEach(function (x) { x.classList.toggle('on', x === b); });
      layout(b.getAttribute('data-sort'));
    });
  });
})();

/* =====================================================================
   2. scatter physical harm × dependence
   ===================================================================== */
(function () {
  var s = document.getElementById('scatter');
  var L = 70, R = 830, T = 20, B = 510;
  var xs = function (v) { return L + v / 3 * (R - L); };
  var ys = function (v) { return B - v / 3 * (B - T); };
  for (var v = 0; v <= 3; v += 0.5) {
    el('line', { x1:xs(v), x2:xs(v), y1:T, y2:B, class:'gridl' }, s);
    el('line', { x1:L, x2:R, y1:ys(v), y2:ys(v), class:'gridl' }, s);
    el('text', { x:xs(v), y:B + 18, class:'ax', 'text-anchor':'middle' }, s, v);
    el('text', { x:L - 10, y:ys(v) + 4, class:'ax', 'text-anchor':'end' }, s, v);
  }
  el('text', { x:(L + R) / 2, y:B + 42, class:'ax', 'text-anchor':'middle' }, s, tr('physical harm →', 'dommages physiques →'));
  el('text', { x:18, y:(T + B) / 2, class:'ax', 'text-anchor':'middle', transform:'rotate(-90 18 ' + (T + B) / 2 + ')' }, s, tr('dependence →', 'dépendance →'));
  var pts = DRUGS.filter(function (d) { return d.n7; }).map(function (d) {
    return { id:d.id, n:d.n7name || d.n, lg:d.lg, v:d.n7 };
  }).concat(EXTRA07.map(function (d) { return { id:d.id, n:d.n, lg:d.lg, v:d.n7 }; }));
  // label offsets to avoid the worst collisions
  var OFF = { heroin:[-12,4,'end'], cocaine:[12,4], barb:[12,10], methadone:[-14,-6,'end'],
              alcohol:[-12,-10,'end'], tobacco:[-12,0,'end'], benzo:[12,-4], ketamine:[12,12],
              amph:[12,-2], bupe:[-12,12,'end'], cannabis:[-12,-2,'end'], butane:[12,6],
              mta:[10,-8], mph:[12,20], steroids:[12,10], lsd:[-10,-10,'end'],
              ghb:[-12,6,'end'], mdma:[-12,18,'end'], nitrites:[-12,12,'end'], khat:[-12,4,'end'] };
  var gs = [];
  pts.sort(function (a, b) { return b.v[2] - a.v[2]; }).forEach(function (p, i) {
    var g = el('g', {}, s);
    var r = 6 + p.v[2] * 7;
    var c = el('circle', { cx:xs(p.v[0]), cy:ys(p.v[1]), r:0, fill:COL[p.lg], 'fill-opacity':.28,
                           stroke:COL[p.lg], 'stroke-width':1.4 }, g);
    c.style.transition = 'r .8s cubic-bezier(.2,.8,.2,1) ' + (i * 45) + 'ms';
    var o = OFF[p.id] || [12, 4];
    var dx = Math.abs(o[0]) >= 10 ? (o[0] > 0 ? 1 : -1) * (r + 4) : o[0];
    el('text', { x:xs(p.v[0]) + dx, y:ys(p.v[1]) + o[1], class:'lbl', 'text-anchor':o[2] || 'start', fill:COL2[p.lg] }, g, p.n);
    hoverable(g, function () {
      return '<b>' + p.n + '</b>' + tr('physical harm ', 'dommages physiques : ') + nf(p.v[0], 2) + '<br>' + tr('dependence ', 'dépendance : ') + nf(p.v[1], 2) +
             '<br>' + tr('social harm ', 'dommages sociaux : ') + nf(p.v[2], 2) + '<br><span class="d">' + LGNAME[p.lg] + '</span>';
    });
    gs.push([c, r]);
  });
  onVisible(s, function () { gs.forEach(function (x) { x[0].setAttribute('r', x[1]); }); });
})();

/* =====================================================================
   3. radar
   ===================================================================== */
(function () {
  var s = document.getElementById('radar');
  var chipsBox = document.getElementById('radarChips');
  var maxU = Math.max.apply(null, DRUGS.map(function (d) { return d.m[1]; }));
  var maxO = Math.max.apply(null, DRUGS.map(function (d) { return d.m[2]; }));
  var maxC = Math.max.apply(null, DRUGS.map(function (d) { return d.cap || 0; }));
  var AX = [
    { n:tr('physical harm', 'dommages physiques'), f:function (d) { return d.n7 ? d.n7[0] / 3 : null; }, raw:function (d) { return d.n7 && nf(d.n7[0], 2) + ' / 3'; } },
    { n:tr('dependence', 'dépendance'), f:function (d) { return d.n7 ? d.n7[1] / 3 : null; }, raw:function (d) { return d.n7 && nf(d.n7[1], 2) + ' / 3'; } },
    { n:tr('gets hooked', 'risque de dépendance'), f:function (d) { return d.cap != null ? d.cap / maxC : null; }, raw:function (d) { return d.cap != null && nf(d.cap) + ' %' + (d.capc ? ' (' + d.capc + ')' : ''); } },
    { n:tr('acute toxicity', 'toxicité aiguë'), f:function (d) { return d.sr ? 1 - Math.log10(d.sr) / 3 : null; }, raw:function (d) { return d.sr && tr('safety ratio ', 'marge de sécurité : ') + d.sr; } },
    { n:tr('harm to others', 'dommages pour les autres'), f:function (d) { return d.m[2] / maxO; }, raw:function (d) { return nf(d.m[2]) + ' / 100'; } },
    { n:tr('social harm', 'dommages sociaux'), f:function (d) { return d.n7 ? d.n7[2] / 3 : null; }, raw:function (d) { return d.n7 && nf(d.n7[2], 2) + ' / 3'; } },
    { n:tr('harm to the user', 'dommages pour l’usager'), f:function (d) { return d.m[1] / maxU; }, raw:function (d) { return nf(d.m[1]) + ' / 100'; } }
  ];
  var cx = 430, cy = 265, R = 200;
  var PAL = ['#ffb454', '#b48ce8', '#8ceedd', '#ff6b6b', '#6ea8ff'];
  var sel = ['alcohol', 'heroin', 'cannabis', 'lsd'];

  DRUGS.forEach(function (d) {
    var b = document.createElement('button');
    b.className = 'tg'; b.textContent = d.n; b.dataset.id = d.id;
    b.addEventListener('click', function () {
      var i = sel.indexOf(d.id);
      if (i >= 0) sel.splice(i, 1); else { sel.push(d.id); if (sel.length > 5) sel.shift(); }
      draw();
    });
    chipsBox.appendChild(b);
  });

  function pt(i, v) {
    var a = -Math.PI / 2 + i * 2 * Math.PI / AX.length;
    return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v];
  }
  function draw() {
    clear(s);
    Array.prototype.forEach.call(chipsBox.children, function (b) {
      var k = sel.indexOf(b.dataset.id);
      b.classList.toggle('on', k >= 0);
      b.style.background = k >= 0 ? PAL[k] : ''; b.style.borderColor = k >= 0 ? PAL[k] : '';
    });
    [0.25, 0.5, 0.75, 1].forEach(function (v) {
      el('polygon', { points:AX.map(function (_, i) { return pt(i, v).join(','); }).join(' '),
                      fill:'none', class:'gridl', stroke:'#1b2230' }, s);
    });
    AX.forEach(function (a, i) {
      var p = pt(i, 1), q = pt(i, 1.13);
      el('line', { x1:cx, y1:cy, x2:p[0], y2:p[1], class:'axl' }, s);
      var anchor = Math.abs(q[0] - cx) < 10 ? 'middle' : (q[0] > cx ? 'start' : 'end');
      el('text', { x:q[0], y:q[1] + 4, class:'ax', 'text-anchor':anchor }, s, a.n);
    });
    sel.forEach(function (id, k) {
      var d = DRUGS.filter(function (x) { return x.id === id; })[0];
      var vals = AX.map(function (a) { return a.f(d); });
      var have = [];
      vals.forEach(function (v, i) { if (v != null) have.push(pt(i, Math.max(v, 0.02))); });
      var poly = el('polygon', { points:have.map(function (p) { return p.join(','); }).join(' '),
                                 fill:PAL[k], 'fill-opacity':.13, stroke:PAL[k], 'stroke-width':2,
                                 'stroke-linejoin':'round' }, s);
      hoverable(poly, function () {
        return '<b>' + d.n + '</b>' + AX.map(function (a) {
          var r = a.raw(d); return a.n + ': ' + (r ? r : '<span class="d">' + tr('not measured', 'non mesuré') + '</span>');
        }).join('<br>');
      });
      vals.forEach(function (v, i) {
        if (v == null) return;
        var p = pt(i, Math.max(v, 0.02));
        el('circle', { cx:p[0], cy:p[1], r:3.5, fill:PAL[k] }, s);
      });
      el('text', { x:20, y:24 + k * 20, class:'lbl', fill:PAL[k] }, s, '● ' + d.n);
    });
  }
  draw();
})();

/* =====================================================================
   4. safety ratio (log)
   ===================================================================== */
(function () {
  var s = document.getElementById('safety');
  var L = 190, R = 810, T = 30, rowH = 30;
  var xs = function (v) { return L + Math.log10(v) / 3.2 * (R - L); };
  [1, 3, 10, 30, 100, 300, 1000].forEach(function (v) {
    el('line', { x1:xs(v), x2:xs(v), y1:T - 8, y2:T + rowH * SAFETY.length, class:'gridl' }, s);
    el('text', { x:xs(v), y:T - 14, class:'ax', 'text-anchor':'middle' }, s, '×' + v);
  });
  // danger gradient band
  var defs = el('defs', {}, s);
  var lg = el('linearGradient', { id:'dz', x1:0, x2:1, y1:0, y2:0 }, defs);
  el('stop', { offset:0, 'stop-color':'#ff6b6b', 'stop-opacity':.22 }, lg);
  el('stop', { offset:0.45, 'stop-color':'#ff6b6b', 'stop-opacity':0 }, lg);
  el('rect', { x:L, y:T - 6, width:R - L, height:rowH * SAFETY.length + 4, fill:'url(#dz)' }, s);
  var items = [];
  SAFETY.forEach(function (d, i) {
    var y = T + i * rowH + rowH / 2;
    var g = el('g', {}, s);
    el('text', { x:L - 12, y:y + 4, 'text-anchor':'end', class:'lbl', fill:COL2[d.lg] }, g, d.n);
    var ln = el('line', { x1:xs(1), x2:xs(1), y1:y, y2:y, stroke:COL[d.lg], 'stroke-width':2, 'stroke-opacity':.5 }, g);
    var c = el('circle', { cx:xs(1), cy:y, r:7, fill:COL[d.lg] }, g);
    var t = el('text', { x:xs(1), y:y + 4, class:'small', opacity:0 }, g, (d.gt ? '>' : '×') + d.v);
    hoverable(g, function () {
      return '<b>' + d.n + '</b>' + tr('a lethal dose ≈ ', 'dose mortelle ≈ ') + d.v + tr('× the usual effective dose', ' fois la dose habituelle') +
             (d.note ? '<br><span class="d">' + d.note + '</span>' : '') + '<br><span class="d">' + LGNAME[d.lg] + '</span>';
    });
    items.push({ d:d, ln:ln, c:c, t:t });
  });
  function grow() {
    var t0 = performance.now(), dur = reduced ? 1 : 1300;
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      items.forEach(function (it) {
        var x = xs(Math.pow(it.d.v, e));
        it.ln.setAttribute('x2', x); it.c.setAttribute('cx', x);
        it.t.setAttribute('x', x + 12); it.t.setAttribute('opacity', e);
      });
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  onVisible(s, grow);
  el('text', { x:L + 6, y:T + rowH * SAFETY.length + 22, class:'small', fill:'#ff6b6b' }, s, tr('← closer to the edge', '← marge plus étroite'));
})();

/* =====================================================================
   5. hooked grids + lifetime bars
   ===================================================================== */
(function () {
  var box = document.getElementById('hooked');
  CAPTURE.forEach(function (d) {
    var div = document.createElement('div');
    div.className = 'hk';
    var s = el('svg', { viewBox:'0 0 100 100' });
    s.style.setProperty('--c', COL[d.lg]);
    var lit = Math.round(d.v);
    for (var i = 0; i < 100; i++) {
      var x = (i % 10) * 10 + 5, y = Math.floor(i / 10) * 10 + 5;
      el('circle', { cx:x, cy:y, r:3.6, class:'dot0' }, s);
      if (i < lit) {
        var c = el('circle', { cx:x, cy:y, r:3.6, class:'dot1' }, s);
        c.style.transitionDelay = (i * 22) + 'ms';
      }
    }
    div.appendChild(s);
    div.insertAdjacentHTML('beforeend', '<div class="n" style="color:' + COL[d.lg] + '">' + nf(d.v) + ' %</div>' +
      '<div class="s">' + d.n + (d.s ? ' <br>(' + d.s + ')' : '') + '</div>');
    box.appendChild(div);
    onVisible(div, function () { s.classList.add('lit'); });
  });

  var s = document.getElementById('lifetime');
  var L = 120, R = 800, rowH = 40;
  var xs = function (v) { return L + v / 100 * (R - L); };
  [0, 25, 50, 75, 100].forEach(function (v) {
    el('line', { x1:xs(v), x2:xs(v), y1:4, y2:4 + rowH * LIFETIME.length, class:'gridl' }, s);
    el('text', { x:xs(v), y:rowH * LIFETIME.length + 20, class:'ax', 'text-anchor':'middle' }, s, v + '%');
  });
  var bars = [];
  LIFETIME.forEach(function (d, i) {
    var y = 4 + i * rowH;
    el('text', { x:L - 12, y:y + rowH / 2 + 4, 'text-anchor':'end', class:'lbl', fill:COL2[d.lg] }, s, d.n);
    var b = el('rect', { class:'bar', x:L, y:y + 8, height:rowH - 16, width:0, rx:3, fill:COL[d.lg] }, s);
    var t = el('text', { x:L + 6, y:y + rowH / 2 + 4, class:'lbl', opacity:0 }, s, nf(d.v) + ' %');
    bars.push([b, t, d]);
  });
  onVisible(s, function () {
    bars.forEach(function (x) {
      x[0].setAttribute('width', xs(x[2].v) - L);
      x[1].setAttribute('x', xs(x[2].v) + 8); x[1].setAttribute('opacity', 1);
      x[1].style.transition = 'opacity .6s .5s';
    });
  });
})();

/* =====================================================================
   6. users (dots) + deaths (area circles)
   ===================================================================== */
(function () {
  var s = document.getElementById('users');
  var perDot = 10, cols = 46, dot = 12.4, L = 250;
  var y = 14, dots = [];
  USERS.forEach(function (d) {
    var n = Math.max(1, Math.round(d.v / perDot));
    var rows = Math.ceil(n / cols);
    el('text', { x:L - 12, y:y + 9, 'text-anchor':'end', class:'lbl', fill:COL2[d.lg] }, s, d.n.split(' (')[0]);
    el('text', { x:L - 12, y:y + 23, 'text-anchor':'end', class:'small' }, s,
       d.v >= 1000 ? nf(+(d.v / 1000).toFixed(2)) + tr(' billion', ' milliards') : d.v + tr(' million', ' millions'));
    for (var i = 0; i < n; i++) {
      var c = el('circle', { cx:L + (i % cols) * dot + 5, cy:y + Math.floor(i / cols) * dot + 5, r:4.4,
                             fill:COL[d.lg], opacity:0 }, s);
      dots.push(c);
    }
    y += Math.max(rows * dot, 30) + 14;
  });
  s.setAttribute('viewBox', '0 0 860 ' + Math.ceil(y));
  onVisible(s, function () {
    if (reduced) { dots.forEach(function (c) { c.setAttribute('opacity', .9); }); return; }
    var i = 0;
    (function step() {
      for (var k = 0; k < 14 && i < dots.length; k++, i++) dots[i].setAttribute('opacity', .9);
      if (i < dots.length) requestAnimationFrame(step);
    })();
  });

  // per-user line
  var tob = 7000000 / 1200e6 * 1e3, alc = 2600000 / 2500e6 * 1e3, drg = 600000 / 331e6 * 1e3,
      opi = 0.8 * 600000 / 63e6 * 1e3;
  document.getElementById('perUser').innerHTML =
    FR ? '<b class="lg">' + nf(tob, 1) + '</b> morts par an pour 1 000 fumeurs, <b class="lg">' + nf(alc, 1) +
    '</b> pour 1 000 buveurs et <b class="il">' + nf(drg, 1) + '</b> pour 1 000 consommateurs de drogues illicites. Pour les opioïdes seuls, on monte à environ <b class="il">' + nf(opi, 1) + '</b> pour 1 000 usagers'
    : '<b class="lg">' + tob.toFixed(1) + '</b> deaths per 1,000 tobacco users per year, <b class="lg">' + alc.toFixed(1) +
    '</b> per 1,000 drinkers and <b class="il">' + drg.toFixed(1) + '</b> per 1,000 people who used an illegal drug in the past year. For opioids alone it is about <b class="il">' + opi.toFixed(1) + '</b> per 1,000 users';

  var ds = document.getElementById('deaths');
  var note = document.getElementById('deathsNote');
  function drawDeaths(region) {
    clear(ds);
    var D = DEATHS[region];
    var maxV = D.items[0].v, Rmax = 150;
    var x = 40;
    D.items.forEach(function (d, i) {
      var r = Math.max(2.5, Rmax * Math.sqrt(d.v / maxV));
      var cx = x + Math.max(r, 40), cy = 320 - r;
      var g = el('g', {}, ds);
      var c = el('circle', { cx:cx, cy:cy, r:0, fill:COL[d.lg], 'fill-opacity':.22, stroke:COL[d.lg], 'stroke-width':1.5 }, g);
      c.style.transition = 'r .9s cubic-bezier(.2,.8,.2,1) ' + (i * 120) + 'ms';
      if (reduced) c.setAttribute('r', r);
      else requestAnimationFrame(function () { requestAnimationFrame(function () { c.setAttribute('r', r); }); });
      el('text', { x:cx, y:cy + r + 22, 'text-anchor':'middle', class:'lbl', fill:COL2[d.lg] }, g, d.n);
      el('text', { x:cx, y:cy + r + 40, 'text-anchor':'middle', class:'small' }, g, fmt(d.v));
      hoverable(g, function () {
        return '<b>' + d.n + '</b>≈ ' + fmt(d.v) + tr(' deaths a year', ' morts par an') + '<br><span class="d">' +
               (d === D.items[0] ? tr('reference', 'référence') : nf(D.items[0].v / d.v, d.v * 10 > D.items[0].v ? 1 : 0) + tr('× fewer than ', ' fois moins que le ') + D.items[0].n) + '</span>';
      });
      x = cx + Math.max(r, 40) + 50;
    });
    // fit: shift group to center
    var w = x - 50;
    if (w < 860) Array.prototype.forEach.call(ds.children, function (g) { g.setAttribute('transform', 'translate(' + (860 - w) / 2 + ',0)'); });
    note.innerHTML = D.note;
    window.__renumber(note);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-region]'), function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-region]').forEach(function (x) { x.classList.toggle('on', x === b); });
      drawDeaths(b.getAttribute('data-region'));
    });
  });
  onVisible(ds, function () { drawDeaths('world'); });
})();

/* =====================================================================
   7. slope chart (harm rank → UK class) + money
   ===================================================================== */
(function () {
  var s = document.getElementById('slope');
  var Lx = 300, Rx = 560, T = 30, rowH = 28;
  var order = DRUGS.slice().sort(function (a, b) { return b.m[0] - a.m[0]; });
  var CLASSES = ['A', 'B', 'C', 'legal'];
  var CLABEL = { A:tr('Class A', 'Classe A'), B:tr('Class B', 'Classe B'), C:tr('Class C', 'Classe C'), legal:tr('not controlled', 'légal') };
  var CDESC = FR ? { A:'trafic : jusqu’à la perpétuité; détention : jusqu’à 7 ans', B:'trafic : jusqu’à 14 ans; détention : jusqu’à 5 ans',
                C:'trafic : jusqu’à 14 ans; détention : jusqu’à 2 ans', legal:'en vente libre (avec limite d’âge)' }
              : { A:'max: life for supply; 7 years for possession', B:'max: 14 years for supply; 5 years for possession',
                C:'max: 14 years for supply; 2 years for possession', legal:'sold legally (age limits)' };
  // right side: groups of each class, stacked
  var rightY = {}, y = T, groups = {};
  CLASSES.forEach(function (c) {
    var members = order.filter(function (d) { return d.uk === c; });
    groups[c] = { y0:y, n:members.length };
    members.forEach(function (d, i) { rightY[d.id] = y + i * rowH * 0.92 + rowH / 2; });
    y += members.length * rowH * 0.92 + 22;
  });
  el('text', { x:Lx, y:T - 12, 'text-anchor':'end', class:'ax' }, s, tr('more harmful ↑ (rank)', 'plus nocif ↑ (classement)'));
  el('text', { x:Rx, y:T - 12, class:'ax' }, s, tr('UK legal status', 'statut légal au Royaume-Uni'));
  CLASSES.forEach(function (c) {
    var gr = groups[c];
    var h = gr.n * rowH * 0.92;
    el('rect', { x:Rx + 2, y:gr.y0, width:4, height:h, rx:2,
                 fill:c === 'legal' ? COL.L : (c === 'A' ? '#ff6b6b' : c === 'B' ? '#e0a0ff' : '#9fb4ff') }, s);
    el('text', { x:Rx + 140, y:gr.y0 + 14, class:'lbl', 'font-weight':600 }, s, CLABEL[c]);
    CDESC[c].split('; ').forEach(function (line, k) {
      el('text', { x:Rx + 140, y:gr.y0 + 30 + k * 13, class:'small' }, s, line);
    });
  });
  var lines = [];
  order.forEach(function (d, i) {
    var yl = T + i * rowH + rowH / 2, yr = rightY[d.id];
    var g = el('g', {}, s);
    var mismatch = (d.uk === 'legal' && i < 8) || (d.uk === 'A' && i >= 12);
    var p = el('path', { d:'M' + Lx + ',' + yl + ' C' + (Lx + 150) + ',' + yl + ' ' + (Rx - 150) + ',' + yr + ' ' + Rx + ',' + yr,
                         fill:'none', stroke:COL[d.lg], 'stroke-width':mismatch ? 2.4 : 1.2,
                         'stroke-opacity':mismatch ? .95 : .35 }, g);
    el('text', { x:Lx - 10, y:yl + 4, 'text-anchor':'end', class:'lbl', fill:COL2[d.lg] }, g, (i + 1) + '. ' + d.n);
    el('text', { x:Lx - 200, y:yl + 4, 'text-anchor':'end', class:'small' }, g, d.m[0]);
    el('circle', { cx:Lx, cy:yl, r:3, fill:COL[d.lg] }, g);
    el('circle', { cx:Rx, cy:yr, r:3, fill:COL[d.lg] }, g);
    el('text', { x:Rx + 12, y:yr + 4, class:'small', fill:COL2[d.lg] }, g, d.n);
    hoverable(g, function () {
      return '<b>' + d.n + '</b>' + tr('harm rank ', 'nocivité : ') + (FR ? (i === 0 ? '1er' : (i + 1) + 'e') : (i + 1)) + tr(' of 20 (score ', ' sur 20 (note ') + d.m[0] + tr(')<br>UK: ', ')<br>R.-U. : ') + CLABEL[d.uk] +
             (mismatch ? '<br><span class="d">' + (d.uk === 'legal' ? tr('among the most harmful, freely sold', 'parmi les plus nocifs, et en vente libre') : tr('among the least harmful, in the strictest class', 'parmi les moins nocifs, mais dans la classe la plus sévère')) + '</span>' : '');
    });
    var len = 900;
    p.setAttribute('stroke-dasharray', len); p.setAttribute('stroke-dashoffset', len);
    lines.push(p);
  });
  s.setAttribute('viewBox', '0 0 860 ' + Math.max(T + 20 * rowH + 20, y));
  onVisible(s, function () {
    lines.forEach(function (p, i) {
      p.style.transition = reduced ? 'none' : 'stroke-dashoffset 1.2s ease ' + (i * 50) + 'ms';
      p.setAttribute('stroke-dashoffset', 0);
    });
  });

  // money
  var m = document.getElementById('money');
  var L = 140, R = 820, rowH2 = 80;
  var xs = function (v) { return L + v / 180 * (R - L); };
  [0, 30, 60, 90, 120, 150, 180].forEach(function (v) {
    el('line', { x1:xs(v), x2:xs(v), y1:10, y2:10 + rowH2 * 3, class:'gridl' }, m);
    el('text', { x:xs(v), y:10 + rowH2 * 3 + 18, class:'ax', 'text-anchor':'middle' }, m, FR ? v + ' Md€' : '€' + v + 'bn');
  });
  var mb = [];
  MONEY.forEach(function (d, i) {
    var y = 10 + i * rowH2;
    el('text', { x:L - 12, y:y + 30, 'text-anchor':'end', class:'lbl', fill:COL2[d.lg] }, m, d.n);
    var c = el('rect', { class:'bar', x:L, y:y + 12, height:24, width:0, rx:3, fill:COL[d.lg], 'fill-opacity':.85 }, m);
    var t = el('rect', { class:'bar', x:L, y:y + 42, height:14, width:0, rx:3, fill:'#8ceedd', 'fill-opacity':.8 }, m);
    el('text', { x:L + 6, y:y + 29, class:'small', fill:'#07080c' }, m, '');
    var ct = el('text', { x:xs(d.cost) + 8, y:y + 29, class:'lbl', opacity:0 }, m, FR ? 'coût social ' + nf(d.cost) + ' Md€' : 'social cost €' + d.cost + 'bn');
    var tt = el('text', { x:xs(Math.max(d.tax, 0)) + 8, y:y + 54, class:'small', opacity:0 }, m,
                d.tax ? (FR ? 'recettes fiscales ' + nf(d.tax, 1) + ' Md€' : 'tax revenue €' + d.tax + 'bn') : tr('no tax revenue', 'aucune recette fiscale'));
    mb.push([c, t, ct, tt, d]);
  });
  onVisible(m, function () {
    mb.forEach(function (x) {
      x[0].setAttribute('width', xs(x[4].cost) - L); x[1].setAttribute('width', xs(x[4].tax) - L);
      [x[2], x[3]].forEach(function (t) { t.style.transition = 'opacity .6s .5s'; t.setAttribute('opacity', 1); });
    });
  });
  document.getElementById('moneyNote').innerHTML = FR ?
    'Coût social annuel (barres épaisses) et recettes fiscales (barres fines, en turquoise), France, 2019. Kopp 2023, OFDT<sup class="ref"><a href="#s-kopp">16</a></sup>. ' +
    'Les taxes couvrent environ 8 % du coût social du tabac et 4 % de celui de l’alcool. Kopp précise qu’il ne faut pas additionner les trois totaux, qui se recoupent en partie. ' +
    'Dans son estimation précédente, portant sur 2010, l’alcool et le tabac étaient à égalité, à environ 120 Md€ chacun.' :
    'Social cost per year (bars) vs tax revenue (thin teal bars), France, 2019. Kopp 2023, OFDT<sup class="ref"><a href="#s-kopp">16</a></sup>. ' +
    'Taxes cover about 8 % of tobacco\'s social cost and 4 % of alcohol\'s. Kopp warns the three totals should not be added up (they partly double-count). ' +
    'His earlier estimate for 2010 had alcohol and tobacco level at about €120bn each.';
  window.__renumber(document.getElementById('moneyNote'));
})();

/* =====================================================================
   7. ripple grid (editorial evidence synthesis)
   ===================================================================== */
(function () {
  var s = document.getElementById('ripple');
  var COLS = FR ? ['violences, dont conjugales', 'violences sexuelles', 'morts sur la route', 'grossesse', 'enfants exposés',
              'santé mentale', 'suicide', 'violence du trafic']
            : ['violence & partner abuse', 'sexual violence', 'road deaths', 'unborn child', 'children at home',
              'psychosis & mind', 'suicide', 'market violence'];
  var LV = FR ? ['effet faible ou peu étudié', 'données partielles ou contradictoires', 'données concordantes', 'données solides, effet massif']
              : ['little evidence of a large effect, or barely studied', 'some or mixed evidence', 'consistent evidence', 'strong evidence, large scale'];
  // levels 0..3 per column, plus per-cell basis text where it matters
  var ROWS = [
    { n:tr('alcohol','alcool'), lg:'L', v:[3,3,3,3,3,1,3,0], t:FR ? {
        0:'25 % des auteurs d’homicides conjugaux en France avaient bu (2024) ; ≈18 % des morts par violence dans le monde ; risque ×1,4 de violences conjugales chez les hommes',
        1:'de l’alcool dans environ la moitié des agressions sexuelles (auteur, victime ou les deux) ; boisson la plus utilisée pour la soumission chimique',
        2:'28,9 % des morts sur les routes françaises ; ≈27 % dans le monde', 3:'troubles causés par l’alcoolisation fœtale : 7,7 enfants sur 1 000 dans le monde, 19,8 en Europe',
        4:'1 enfant américain sur 10 vit avec un parent dépendant à l’alcool', 5:'atteintes cérébrales et psychoses liées à l’alcool : réelles, mais non chiffrées dans les sources de cette page',
        6:'jusqu’à 18 % des suicides dans le monde', 7:'marché légal : peu de violence liée au commerce aujourd’hui (contrairement à la Prohibition américaine, 1920–1933)' } : {
        0:'25 % of French partner-killers drunk (2024); ≈18 % of violent deaths worldwide; OR 1.4 for male partner violence',
        1:'≈half of sexual assaults involve alcohol (perpetrator, victim or both); main vehicle for drugging',
        2:'28.9 % of French road deaths; ≈27 % worldwide', 3:'FASD 7.7 per 1,000 children worldwide, 19.8 in Europe',
        4:'1 in 10 US children live with a parent with an alcohol use disorder', 5:'alcohol-related brain damage and psychosis exist but are not quantified by the sources on this page',
        6:'up to 18 % of suicides worldwide', 7:'legal market: little systemic violence today (unlike US Prohibition, 1920–33)' } },
    { n:tr('tobacco','tabac'), lg:'L', v:[0,0,0,3,2,0,0,1], t:FR ? {
        3:'tabac pendant la grossesse : petit poids de naissance, prématurité ; 12,2 % des femmes enceintes fument encore au 3e trimestre en France',
        4:'le tabagisme passif nuit aux enfants ; il tue plus de 1,6 million de personnes par an dans le monde',
        7:'la contrebande de tabac existe ; son ampleur est discutée (17,7 % ou 41 % en France)' } : {
        3:'smoking in pregnancy: low birth weight, prematurity; 12.2 % of French women smoke in the third trimester',
        4:'second-hand smoke harms children at home; >1.6 M second-hand-smoke deaths a year worldwide',
        7:'illicit tobacco trade exists; its size is disputed (17.7 % vs 41 % in France)' } },
    { n:'cannabis', lg:'I', v:[1,1,2,1,1,3,1,3], t:FR ? {
        0:'résultats contradictoires : certaines méta-analyses trouvent un lien avec les violences conjugales, d’autres non',
        1:'deuxième produit, après l’alcool, dans les cas de « vulnérabilité chimique » en France',
        2:'risque d’accident ×1,3 à ×1,65 ; la plupart des 19,6 % de morts sur la route avec stupéfiants, souvent associés à l’alcool',
        5:'cannabis fortement dosé tous les jours : risque de psychose ×4,8 (causalité discutée)',
        7:'la drogue illégale la plus consommée (256 millions d’usagers dans le monde) ; environ 3 000 points de deal en France' } : {
        0:'mixed: some meta-analyses find a link with partner violence, others no drug-type difference',
        1:'second most common substance (after alcohol) in "chemical vulnerability" cases in France',
        2:'driver crash risk ≈1.3–1.65×; most of the 19.6 % drug-positive French road deaths, often with alcohol',
        5:'daily high-potency use: psychosis odds ×4.8 (causality debated)',
        7:'the most used illegal drug (256 M users worldwide); France has ≈3,000 street dealing points' } },
    { n:tr('cocaine & crack','cocaïne et crack'), lg:'I', v:[2,1,1,1,2,1,1,3], t:FR ? {
        0:'la drogue la plus associée aux violences conjugales dans une méta-analyse de 96 études ; délinquance pour financer le crack',
        5:'paranoïa, psychoses ; risque d’infarctus ×24 dans l’heure qui suit la prise',
        7:'alimente la violence des Andes jusqu’à Guayaquil, Anvers, Rotterdam et Marseille' } : {
        0:'strongest drug predictor of partner violence in a 96-study meta-analysis; economic-compulsive crime with crack',
        5:'paranoia, stimulant psychosis; heart-attack risk ×24 in the hour after use',
        7:'drives the violence from the Andes to Ecuador, Antwerp, Rotterdam and Marseille' } },
    { n:tr('opioids','opioïdes'), lg:'I', v:[1,1,1,3,3,1,1,3], t:FR ? {
        3:'sevrage du nouveau-né : 7,3 naissances sur 1 000 aux États-Unis (2017), 53,5 en Virginie-Occidentale',
        4:'la drogue chez les parents intervient dans un tiers des placements d’enfants aux États-Unis',
        7:'fentanyl : cartels mexicains, précurseurs chinois et indiens ; économies de l’opium en Afghanistan et en Birmanie' } : {
        3:'neonatal opioid withdrawal: 7.3 per 1,000 US births (2017), 53.5 in West Virginia',
        4:'parental drug use is a factor in a third of US foster-care placements',
        7:'fentanyl: Mexican cartels, precursors from China and India; Afghan and Myanmar opium economies' } },
    { n:tr('meth & amphetamines','méth et amphétamines'), lg:'I', v:[2,1,1,1,2,3,1,2], t:FR ? {
        0:'stimulants associés aux violences conjugales ; la consommation problématique compte plus que le produit',
        5:'36,5 % des consommateurs étudiés (surtout à l’hôpital) ont fait une psychose',
        7:'le Captagon, une amphétamine, a financé le régime Assad : jusqu’à 1,8 milliard de dollars par an' } : {
        0:'stimulant use linked to partner violence; problem use matters more than drug type',
        5:'36.5 % drug-induced psychosis in pooled (mostly clinical) samples of people who use it',
        7:'Captagon (an amphetamine) financed the Assad regime: up to $1.8 bn a year to Syria-linked actors' } },
    { n:tr('sedatives (benzos, GHB)','sédatifs (benzos, GHB)'), lg:'R', v:[1,3,1,1,1,1,1,1], t:FR ? {
        1:'les médicaments sédatifs représentent 59,6 % des produits de soumission chimique en France ; du lorazépam dans l’affaire de Mazan' } : {
        1:'sedative medicines are 59.6 % of substances in French drug-facilitated assaults; lorazepam in the Mazan case' } },
    { n:'MDMA', lg:'I', v:[0,2,1,0,0,1,0,2], t:FR ? {
        1:'principale drogue illégale utilisée pour la soumission chimique en France, quatre années de suite',
        7:'laboratoires clandestins aux Pays-Bas et en Belgique ; déchets chimiques abandonnés dans la nature' } : {
        1:'the main illicit drug used for drug-facilitated assault in France, four years running',
        7:'synthetic-drug labs in the Netherlands and Belgium; chemical waste dumping' } },
    { n:tr('psychedelics','psychédéliques'), lg:'I', v:[1,0,0,0,0,2,1,0], t:FR ? {
        0:'2,6 % des personnes racontant leur pire expérience avec des champignons avaient été violentes',
        5:'bad trips ; 7,6 % ont consulté pour des troubles persistants ; HPPD chez 4,2 % dans une enquête ; rares psychoses durables',
        6:'3 tentatives de suicide parmi 1 993 récits de bad trip', 7:'petit marché, peu violent' } : {
        0:'2.6 % of people describing their worst psilocybin trip had been violent',
        5:'bad trips; 7.6 % sought help for lasting symptoms after their worst trip; HPPD 4.2 % in one survey; rare lasting psychosis',
        6:'3 suicide attempts among 1,993 worst-trip reports', 7:'small, mostly non-violent market' } }
  ];
  var L = 200, T = 120, cw = 100, rh = 42;
  COLS.forEach(function (c, j) {
    var x = L + j * cw + cw / 2;
    el('text', { x:x, y:T - 14, class:'ax', 'text-anchor':'start', transform:'rotate(-32 ' + x + ' ' + (T - 14) + ')' }, s, c);
  });
  var cells = [];
  ROWS.forEach(function (r, i) {
    var y = T + i * rh + rh / 2;
    el('text', { x:L - 14, y:y + 4, 'text-anchor':'end', class:'lbl', fill:COL2[r.lg] }, s, r.n);
    el('line', { x1:L, x2:L + COLS.length * cw, y1:y + rh / 2, y2:y + rh / 2, class:'gridl' }, s);
    r.v.forEach(function (lv, j) {
      var x = L + j * cw + cw / 2;
      var g = el('g', {}, s);
      el('rect', { x:x - cw / 2 + 2, y:y - rh / 2 + 2, width:cw - 4, height:rh - 4, fill:'transparent' }, g);
      var c = el('circle', { cx:x, cy:y, r:0, fill:j === 7 ? '#ff6b6b' : COL[r.lg],
                             'fill-opacity':[0.12, 0.35, 0.65, 0.95][lv] }, g);
      c.style.transition = 'r .6s cubic-bezier(.2,.8,.2,1) ' + ((i + j) * 30) + 'ms';
      hoverable(g, function () {
        return '<b>' + r.n + ' · ' + COLS[j] + '</b>' + LV[lv] + (r.t[j] ? '<br><span class="d">' + r.t[j] + '</span>' : '');
      });
      cells.push([c, [5, 9, 13, 17][lv]]);
    });
  });
  onVisible(s, function () { cells.forEach(function (x) { x[0].setAttribute('r', x[1]); }); });
  var lg = document.getElementById('rippleLegend');
  lg.innerHTML = LV.map(function (t, k) {
    return '<span style="--c:rgba(232,230,223,' + [0.15, 0.35, 0.65, 0.95][k] + ')">' + t + '</span>';
  }).join('') + '<span style="--c:#ff6b6b">' + tr('market violence column (red)', 'violence du trafic (en rouge)') + '</span>';
})();

/* ANSM drug-facilitated assault bars */
(function () {
  var s = document.getElementById('ansm');
  var BARS = [
    { n:tr('suspected cases (1,377)', 'cas suspects (1 377)'), parts:[[905, tr('possible drugging', 'soumission possible'), '#b48ce8'], [140, tr('probable', 'probable'), '#ff6b6b'], [332, tr('chemical vulnerability', 'vulnérabilité chimique'), '#6a7090']] },
    { n:tr('substances mentioned', 'substances citées'), parts:[[59.6, tr('sedative medicines', 'médicaments sédatifs'), '#8ceedd'], [40.4 * 0.513, 'stimulants', '#b48ce8'], [40.4 * 0.487, tr('other illicit', 'autres drogues'), '#6a7090']] },
    { n:tr('victims', 'victimes'), parts:[[85.5, tr('women', 'femmes'), '#ffb454'], [14.5, tr('men', 'hommes'), '#6a7090']] },
    { n:tr('perpetrators', 'auteurs'), parts:[[96.4, tr('men', 'hommes'), '#ff6b6b'], [3.6, tr('women', 'femmes'), '#6a7090']] }
  ];
  var L = 190, R = 840, rh = 58;
  BARS.forEach(function (b, i) {
    var y = 10 + i * rh, tot = b.parts.reduce(function (a, p) { return a + p[0]; }, 0), x = L;
    el('text', { x:L - 12, y:y + 18, 'text-anchor':'end', class:'lbl' }, s, b.n);
    b.parts.forEach(function (p) {
      var w = p[0] / tot * (R - L);
      var g = el('g', {}, s);
      el('rect', { x:x, y:y + 4, width:Math.max(w - 2, 1), height:22, rx:3, fill:p[2] }, g);
      var pct = Math.round(p[0] / tot * 1000) / 10;
      if (w > 60) el('text', { x:x + 4, y:y + 42, class:'small' }, g, (w > 110 ? p[1] + ' ' : '') + nf(pct) + ' %');
      hoverable(g, function () { return '<b>' + b.n + '</b>' + p[1] + ' : '.slice(FR ? 0 : 1) + nf(pct) + ' %'; });
      x += w;
    });
  });
})();

/* road deaths waffle (France 2024) */
(function () {
  var s = document.getElementById('road');
  // 3,193 deaths: alcohol 922, drugs 624, either 1,243 → both 303
  var K = [[62, '#ffb454', tr('alcohol only (619)', 'alcool seul (619)')], [30, '#ff6b6b', tr('alcohol + drugs (303)', 'alcool + drogues (303)')],
           [32, '#b48ce8', tr('drugs only (321)', 'drogues seules (321)')], [195, '#1a2030', tr('neither (1,950)', 'ni alcool ni drogue (1 950)')]];
  var cols = 40, sz = 13, L = 20, i = 0, cells = [];
  K.forEach(function (k) {
    for (var n = 0; n < k[0]; n++, i++) {
      var r = el('rect', { x:L + (i % cols) * (sz + 2), y:10 + Math.floor(i / cols) * (sz + 2), width:sz, height:sz, rx:2, fill:k[1], opacity:0 }, s);
      r.style.transition = 'opacity .3s ' + (i * 6) + 'ms';
      cells.push(r);
    }
  });
  K.forEach(function (k, j) {
    el('rect', { x:L + cols * (sz + 2) + 20, y:16 + j * 26, width:12, height:12, rx:2, fill:k[1] }, s);
    el('text', { x:L + cols * (sz + 2) + 40, y:26 + j * 26, class:'lbl' }, s, k[2]);
  });
  onVisible(s, function () { cells.forEach(function (r) { r.setAttribute('opacity', 1); }); });
})();

/* =====================================================================
   8. trafficking map
   ===================================================================== */
(function () {
  var s = document.getElementById('map');
  var land = document.getElementById('land');
  land.setAttribute('fill', '#182033'); land.setAttribute('stroke', '#1f2738'); land.setAttribute('stroke-width', '.6');
  function P(lon, lat) { return [(lon + 180) / 360 * 1000, (84 - lat) / 360 * 1000]; }
  var DR = {
    coke: { n:tr('cocaine', 'cocaïne'), c:'#e8e6df' },
    fent: { n:tr('fentanyl & precursors', 'fentanyl et précurseurs'), c:'#ff6b6b' },
    opium:{ n:tr('opium & heroin', 'opium et héroïne'), c:'#ffb454' },
    capt: { n:'captagon', c:'#8ceedd' }
  };
  var ROUTES = [
    ['coke', [[-74, 2], [-80, -2.2], [4.4, 51.2]]],
    ['coke', [[4.4, 51.2], [0.1, 49.5], [5.4, 43.3]]],
    ['coke', [[-74, 2], [-90, 15], [-102, 23], [-98, 35]]],
    ['coke', [[-64, -17], [-46.3, -24], [-15, 12], [-6, 37]]],
    ['fent', [[114, 30], [180, 26]]], ['fent', [[-180, 26], [-106, 24]]],
    ['fent', [[78, 21], [180, 20]]], ['fent', [[-180, 20], [-106, 24]]],
    ['fent', [[-106, 24], [-98, 35]]],
    ['opium',[[66, 34], [53, 32], [32, 39], [21, 44], [10, 50]]],
    ['opium',[[97, 21], [100.5, 13.7], [115, -5]]],
    ['capt', [[38, 35], [46.7, 24.7], [54, 24]]]
  ];
  var defs = el('defs', {}, s);
  var gl = el('filter', { id:'glow', x:'-50%', y:'-50%', width:'200%', height:'200%' }, defs);
  el('feGaussianBlur', { stdDeviation:'2.2', result:'b' }, gl);
  var mg = el('feMerge', {}, gl); el('feMergeNode', { in:'b' }, mg); el('feMergeNode', { in:'SourceGraphic' }, mg);
  var paths = [];
  ROUTES.forEach(function (r) {
    var pts = r[1].map(function (p) { return P(p[0], p[1]); });
    var d = 'M' + pts[0].join(',');
    for (var k = 1; k < pts.length; k++) {
      var a = pts[k - 1], b = pts[k];
      var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - Math.min(40, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.15);
      d += ' Q' + mx + ',' + my + ' ' + b.join(',');
    }
    var p = el('path', { d:d, fill:'none', stroke:DR[r[0]].c, 'stroke-width':1.6, 'stroke-opacity':.85,
                         'stroke-dasharray':'4 6', class:'route route-' + r[0], filter:'url(#glow)' }, s);
    paths.push(p);
  });
  var keys = document.getElementById('mapKeys');
  keys.innerHTML = '<span class="lab">' + tr('routes', 'routes') + '</span>' + Object.keys(DR).map(function (k) {
    return '<button class="tg on" data-route="' + k + '" style="border-color:' + DR[k].c + '">' + DR[k].n + '</button>';
  }).join('');
  Array.prototype.forEach.call(keys.querySelectorAll('[data-route]'), function (b) {
    var paint = function () { var on = b.classList.contains('on');
      b.style.background = on ? DR[b.dataset.route].c : 'transparent'; b.style.color = on ? '#07080c' : ''; };
    paint();
    b.addEventListener('click', function () {
      b.classList.toggle('on'); paint();
      var on = b.classList.contains('on');
      Array.prototype.forEach.call(s.querySelectorAll('.route-' + b.dataset.route), function (p) { p.style.display = on ? '' : 'none'; });
    });
  });
  if (!reduced) {
    var off = 0;
    (function tick() { off -= 0.35; paths.forEach(function (p) { p.setAttribute('stroke-dashoffset', off); }); requestAnimationFrame(tick); })();
  }

  var SPOTS_EN = [
    { id:'mx', n:'Mexico', at:[-102, 23], h:'33,550 homicides in 2024 (25.8 per 100,000). No official share is attributed to cartels; estimates range from about a third to two thirds (≈55 % in 2023 per Lantia). More than 132,000 people are registered as missing. The Sinaloa and Jalisco (CJNG) cartels make fentanyl from Chinese and Indian precursor chemicals.', r:'s-mexico' },
    { id:'us', n:'United States', at:[-98, 38], h:'Overdose deaths: 105,007 in 2023, 79,384 in 2024 and 69,973 in 2025 (provisional), most involving fentanyl. Black Americans were 3.64× more likely to be arrested for cannabis than white Americans with similar use.', r:'s-cdc' },
    { id:'co', n:'Colombia', at:[-74, 4.5], h:'253,000 ha of coca in 2023, a record. FARC dissidents, the ELN and the Clan del Golfo fund themselves with cocaine, illegal mining and extortion. In January 2025, fighting over coca in Catatumbo displaced more than 50,000 people. Coca is linked to 43–58 % of deforestation in two regions.', r:'s-colombia' },
    { id:'ec', n:'Ecuador', at:[-79.5, -1.8], h:'Homicide rate 5.7 per 100,000 in 2018 → 45.1 in 2023 → 50.9 in 2025, the highest in Latin America. The state declared an "internal armed conflict" against 22 gangs in January 2024. Cocaine leaves Guayaquil hidden in banana and shrimp containers bound for Antwerp, Rotterdam and Valencia; only ≈8–10 % of containers are inspected.', r:'s-ecuador' },
    { id:'br', n:'Brazil', at:[-43.2, -22.9], h:'19.2 homicides per 100,000 (InSight Crime, 2025). A single police operation against the Comando Vermelho in Rio (28 October 2025) left at least 121 dead.', r:'s-brazil' },
    { id:'be', n:'Belgium & the Netherlands', at:[4.4, 51.5], h:'Antwerp seized ≈120 t of cocaine at the 2023 peak, 55 t in 2025; Rotterdam 11.5 t in 2025, a fall that prosecutors attribute to traffickers moving elsewhere. In the Netherlands the lawyer Derk Wiersum (2019) and the journalist Peter R. de Vries (2021) were murdered; in the "Marengo" trial Ridouan Taghi was sentenced to life (February 2024). Brussels saw 92 shootings and 9 deaths in 2024, mostly drug-related.', r:'s-europe' },
    { id:'se', n:'Sweden', at:[18, 59.3], h:'Shootings peaked in 2022 at 391 with 62 dead; 2024: 270 shootings, 44 dead. Police counts of gang-related shootings.', r:'s-europe' },
    { id:'fr', n:'France', at:[5.4, 43.3], h:'Violence linked to drug trafficking: 139 dead in 2023, 110 dead and 341 injured in 2024 (Interior ministry). Marseille counted 49 killings in 2023. About 3,000 street dealing points ("points de deal"). Record 84.3 t of cocaine seized in 2025. Networks recruit minors: a 14-year-old hired killer was sentenced to 17 years in 2026. A 2025 law created a national organised-crime prosecutor and an offence of recruiting minors.', r:'s-france' },
    { id:'sy', n:'Syria', at:[38, 35], h:'Captagon, an amphetamine pill sold mostly in the Gulf: a market worth up to $5.6 bn a year (2020–23), with up to $1.8 bn a year reaching Syria-linked actors, about twice the country\'s legal exports (World Bank). US and UK sanctions named Maher al-Assad and the army\'s Fourth Division. Since the regime fell (December 2024), authorities report 697 million pills seized.', r:'s-captagon' },
    { id:'af', n:'Afghanistan', at:[66, 34], h:'After the Taliban banned opium in April 2022, cultivation fell 95 % in a year (233,000 → 10,800 ha); 10,200 ha in 2025. Myanmar became the largest producer.', r:'s-opium' },
    { id:'mm', n:'Myanmar', at:[97, 21], h:'The world\'s largest opium producer since 2023: 1,010 t on 53,100 ha in 2025, more than twice Afghanistan, amid the civil war that followed the 2021 military coup.', r:'s-opium' },
    { id:'ir', n:'Iran', at:[53, 32], h:'At least 955 executions for drug offences in 2025, most of the world total of at least 1,212 (Saudi Arabia 240, Singapore 15). More than 2,450 people sit on death row for drugs across 36 countries.', r:'s-hri' },
    { id:'ph', n:'Philippines', at:[122, 12.5], h:'Rodrigo Duterte\'s "war on drugs" (2016–2022): 6,252 killed according to police, up to 30,000 according to rights groups. Arrested for the International Criminal Court on 11 March 2025; charges of crimes against humanity confirmed in April 2026, trial due to open 30 November 2026.', r:'s-ph' }
  ];
  var SPOTS_FR = {
    mx:['Mexique', '33 550 homicides en 2024 (25,8 pour 100 000). Aucune part officielle n’est attribuée aux cartels ; les estimations vont d’un tiers aux deux tiers (≈55 % en 2023 selon Lantia). Plus de 132 000 personnes sont enregistrées comme disparues. Les cartels de Sinaloa et de Jalisco (CJNG) fabriquent le fentanyl avec des précurseurs chimiques importés de Chine et d’Inde.'],
    us:['États-Unis', 'Décès par overdose : 105 007 en 2023, 79 384 en 2024 et 69 973 en 2025 (provisoire), majoritairement liés au fentanyl. Un Noir avait 3,64 fois plus de risques qu’un Blanc d’être arrêté pour du cannabis, à consommation égale.'],
    co:['Colombie', '253 000 ha de coca en 2023, un record. Les dissidences des FARC, l’ELN et le Clan del Golfo se financent par la cocaïne, l’orpaillage illégal et l’extorsion. En janvier 2025, des combats pour la coca dans le Catatumbo ont déplacé plus de 50 000 personnes. La coca est liée à 43–58 % de la déforestation dans deux régions.'],
    ec:['Équateur', 'Taux d’homicides : 5,7 pour 100 000 en 2018 → 45,1 en 2023 → 50,9 en 2025, le plus élevé d’Amérique latine. L’État a déclaré un « conflit armé interne » contre 22 gangs en janvier 2024. La cocaïne quitte Guayaquil cachée dans des conteneurs de bananes et de crevettes vers Anvers, Rotterdam et Valence ; seuls ≈8–10 % des conteneurs sont inspectés.'],
    br:['Brésil', '19,2 homicides pour 100 000 (InSight Crime, 2025). Une seule opération de police contre le Comando Vermelho à Rio (28 octobre 2025) a fait au moins 121 morts.'],
    be:['Belgique & Pays-Bas', 'Anvers a saisi ≈120 t de cocaïne au pic de 2023, 55 t en 2025 ; Rotterdam 11,5 t en 2025, une baisse que le parquet attribue au déplacement des trafiquants. Aux Pays-Bas, l’avocat Derk Wiersum (2019) et le journaliste Peter R. de Vries (2021) ont été assassinés ; au procès « Marengo », Ridouan Taghi a été condamné à la perpétuité (février 2024). Bruxelles a connu 92 fusillades et 9 morts en 2024, liées pour la plupart à la drogue.'],
    se:['Suède', 'Les fusillades ont culminé en 2022 : 391, avec 62 morts ; 2024 : 270 fusillades, 44 morts. Chiffres de la police sur les fusillades entre bandes criminelles.'],
    fr:['France', 'Violences liées au narcotrafic : 139 morts en 2023, 110 morts et 341 blessés en 2024 (ministère de l’Intérieur). Marseille a compté 49 assassinats en 2023. Environ 3 000 points de deal. Record de 84,3 t de cocaïne saisies en 2025. Les réseaux recrutent des mineurs : un tueur à gages de 14 ans a été condamné à 17 ans en 2026. Une loi de 2025 a créé un parquet national anticriminalité organisée et un délit de recrutement de mineurs.'],
    sy:['Syrie', 'Le Captagon, un comprimé d’amphétamine écoulé surtout dans les pays du Golfe : un marché pouvant atteindre 5,6 Md$ par an (2020–23), dont jusqu’à 1,8 Md$ par an pour des acteurs liés à la Syrie, environ deux fois les exportations légales du pays (Banque mondiale). Washington et Londres ont sanctionné Maher el-Assad, frère du président, et la 4e division de l’armée. Depuis la chute du régime (décembre 2024), les autorités font état de 697 millions de pilules saisies.'],
    af:['Afghanistan', 'Après l’interdiction de l’opium par les talibans en avril 2022, la culture a chuté de 95 % en un an (233 000 → 10 800 ha) ; 10 200 ha en 2025. La Birmanie est devenue le premier producteur.'],
    mm:['Birmanie', 'Premier producteur mondial d’opium depuis 2023 : 1 010 t sur 53 100 ha en 2025, plus du double de l’Afghanistan, en pleine guerre civile depuis le coup d’État militaire de 2021.'],
    ir:['Iran', 'Au moins 955 exécutions pour des infractions liées aux drogues en 2025, la majeure partie du total mondial d’au moins 1 212 (Arabie saoudite 240, Singapour 15). Plus de 2 450 personnes sont dans le couloir de la mort pour drogues, dans 36 pays.'],
    ph:['Philippines', '« Guerre contre la drogue » de Rodrigo Duterte (2016–2022) : 6 252 tués selon la police, jusqu’à 30 000 selon les ONG. Arrêté sur mandat de la Cour pénale internationale le 11 mars 2025 ; les charges de crimes contre l’humanité ont été confirmées en avril 2026, et son procès doit s’ouvrir le 30 novembre 2026.']
  };
  var SPOTS = SPOTS_EN.map(function (sp) {
    if (FR) { sp.n = SPOTS_FR[sp.id][0]; sp.h = SPOTS_FR[sp.id][1]; }
    return sp;
  });
  var spot = document.getElementById('spot');
  var idx = {}; SRC.forEach(function (x, i) { idx[x[0]] = i + 1; });
  var dots = [];
  function pick(sp) {
    dots.forEach(function (d) { d[1].setAttribute('stroke-width', d[0] === sp ? 2.4 : 0); });
    spot.innerHTML = '<div class="t">' + sp.n + '</div><p style="color:var(--fg)">' + sp.h +
      ' <sup class="ref"><a href="#' + sp.r + '">' + (idx[sp.r] || '') + '</a></sup></p>';
  }
  SPOTS.forEach(function (sp) {
    var p = P(sp.at[0], sp.at[1]);
    var g = el('g', { class:'hov', tabindex:0, role:'button', 'aria-label':sp.n }, s);
    var halo = el('circle', { cx:p[0], cy:p[1], r:6, fill:'#ff6b6b', 'fill-opacity':.25, class:'pulse' }, g);
    var c = el('circle', { cx:p[0], cy:p[1], r:4.2, fill:'#ff6b6b', stroke:'#fff', 'stroke-width':0 }, g);
    el('text', { x:p[0] + 7, y:p[1] - 6, class:'small', fill:'#e8e6df' }, g, sp.n);
    g.addEventListener('click', function () { pick(sp); });
    g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(sp); } });
    dots.push([sp, c]);
  });
  pick(SPOTS[3]);
})();

/* language switch keeps the reader at the same chapter */
(function () {
  var a = document.getElementById('lang');
  if (!a) return;
  a.addEventListener('click', function () {
    var cur = '';
    Array.prototype.forEach.call(document.querySelectorAll('section[id]'), function (s) {
      if (s.getBoundingClientRect().top < window.innerHeight * 0.4) cur = s.id;
    });
    if (cur && cur !== 'hero') a.href = a.getAttribute('href').split('#')[0] + '#' + cur;
  });
})();

/* reveal-on-scroll for text blocks */
Array.prototype.forEach.call(document.querySelectorAll('section.ch .wrap > p, section.ch .wrap > h2, section.ch .panel, .card, .callout, blockquote, .tl'), function (n) {
  n.classList.add('reveal');
  onVisible(n, function () { n.classList.add('in'); });
});

})();
