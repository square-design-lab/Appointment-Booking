const XLSX = require('xlsx');
const fs = require('fs');

const wb = XLSX.readFile('C:/Users/samiu/Downloads/Provider_Profiles_for_Scheduling_App_Filled (1).xlsx');
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], {header:1, defval:''});

const INSURANCE_IDX = {
  12:'Aetna', 13:'Americas PPO', 14:'Blue Cross Blue Shield', 15:'Cigna',
  16:'HealthPartners', 17:'Medica', 18:'Medicaid', 19:'Medicare',
  20:'Optum', 21:'UCare', 22:'United Healthcare', 23:'United Behavioral Health',
  24:'Tricare', 25:'Other Commercial Insurance', 26:'Self-Pay'
};

// "What We Treat" columns 37-58 (fix typos from Excel)
const TREAT_IDX = {
  37:'Anxiety and Worry', 38:'Depression and Low Mood', 39:'Trauma and PTSD',
  40:'ADHD', 41:'Relationship and Couples Issues', 42:'Family Conflict and Parenting Support',
  43:'Grief and Loss', 44:'Life Transitions and Stress', 45:'Substance Use and Addiction',
  46:'OCD (Obsessive Compulsive Disorder)', 47:'Bipolar Disorder',
  48:'Autism Spectrum and Neurodivergence', 49:'Personality Disorders',
  50:'Eating and Body Image', 51:'Sleep and Insomnia', 52:'Self-Esteem and Identity',
  53:'Anger Management', 54:'Perinatal and Maternal Mental Health', 55:'LGBTQ+',
  56:"Men's Mental Health", 57:"Women's Mental Health", 58:'Chronic Illness'
};

// "Treatment Approach" columns 59-68
const APPROACH_IDX = {
  59:'CBT (Cognitive Behavioral Therapy)', 60:'DBT (Dialectical Behavior Therapy)',
  61:'EMDR and ART', 62:'Play Therapy', 63:'Brainspotting', 64:'Parenting Therapy',
  65:'Executive Function Coaching', 66:'Exposure Therapy', 67:'Art Therapy',
  68:'IFS (Internal Family Systems)'
};

const xlMap = {};
for (let i = 4; i <= 40; i++) {
  const r = rows[i];
  if (!r || !r[0]) continue;
  const id = String(r[0]);
  const langs = [];
  if (r[70] === 'X') langs.push('English');
  if (r[71] === 'X') langs.push('Spanish');
  if (r[72] === 'X') langs.push('Other');
  xlMap[id] = {
    acceptingNew:      r[4] === 'X',
    minAge:            r[10] !== '' ? Number(r[10]) : 0,
    maxAge:            r[11] !== '' ? Number(r[11]) : 100,
    telehealthLocs:    [r[8]==='X' ? 'telehealth - mn' : null, r[9]==='X' ? 'telehealth - wi' : null].filter(Boolean).join(','),
    insurance:         Object.entries(INSURANCE_IDX).filter(([c]) => r[+c] === 'X').map(([, n]) => n),
    whatWeTreat:       Object.entries(TREAT_IDX).filter(([c]) => r[+c] === 'X').map(([, n]) => n),
    treatmentApproach: Object.entries(APPROACH_IDX).filter(([c]) => r[+c] === 'X').map(([, n]) => n),
    gender:            r[69] || '',
    languages:         langs.length ? langs : ['English'],
  };
}

const DEFAULT_INS = ['Aetna','Americas PPO','Blue Cross Blue Shield','Cigna','HealthPartners','Medica','Medicaid','Medicare','Optum','UCare','United Healthcare','United Behavioral Health'];
['47','46','33'].forEach(id => { xlMap[id] = { acceptingNew: true, minAge: 0, maxAge: 100, telehealthLocs: 'telehealth - mn', insurance: DEFAULT_INS, whatWeTreat: [], treatmentApproach: [], gender: 'Female', languages: ['English'] }; });

const base = [
  {"athena_provider_id":"28","departmentId":"5","name":"Suzanne Aoun, MD","provider_title":"Psychiatrist","credentials":"MD","specialty":"Psychiatry","specialties":["Psychiatric Medication Management"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Aoun-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"8","departmentId":"1","name":"Emily Campbell, NP","provider_title":"Psychiatric Nurse Practitioner","credentials":"DNP","specialty":"Psychiatry","specialties":["Psychiatric Medication Management","Psychopharmacologic Testing"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Emily-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"37","departmentId":"8","name":"Saul Clayman, MA, LADC","provider_title":"Individual and Couples Therapist","credentials":"MA, LADC","specialty":"Therapy","specialties":["Mental Health Therapy","Couples Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/02/Saul-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"20","departmentId":"5","name":"Lisa Cross, LMFT","provider_title":"Individual Therapist","credentials":"LMFT","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Lisa-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"19","departmentId":"1","name":"Laura Dabruzzi, LICSW","provider_title":"Individual Therapist","credentials":"LICSW","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Laura-D-HS-2-web.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"47","departmentId":"1","name":"Nora Davis, LPCC, LADC","provider_title":"Individual Therapist","credentials":"LPCC, LADC","specialty":"Therapy","specialties":[],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/04/Nora-HS-web.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"26","departmentId":"8","name":"Sabrina Eller, LPCC","provider_title":"Individual Therapist","credentials":"LPCC","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/01/Sabrina-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"43","departmentId":"5","name":"Jenna Halvorson, LPCC","provider_title":"Individual Therapist","credentials":"LPCC","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/02/Jenna-HS2-1.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"21","departmentId":"8","name":"Alicia Exsted, LPCC","provider_title":"Individual Therapist","credentials":"LPCC","specialty":"Therapy","specialties":["Mental Health Therapy","Teen Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Alicia-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"34","departmentId":"8","name":"Beth Falk, LICSW","provider_title":"Individual Therapist","credentials":"LICSW","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/02/Beth-F-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"22","departmentId":"8","name":"Adam Fieldson, LPCC","provider_title":"Individual and Couples Therapist","credentials":"LPCC","specialty":"Therapy","specialties":["Mental Health Therapy","Couples Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Adam-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"9","departmentId":"1","name":"Twilight Florido-Bergad, DNP","provider_title":"Psychiatric Nurse Practitioner","credentials":"DNP","specialty":"Psychiatry","specialties":["Psychiatric Medication Management","Psychopharmacologic Testing"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Twilight-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"10","departmentId":"5","name":"Claire Garber, DO","provider_title":"Psychiatrist","credentials":"DO","specialty":"Psychiatry","specialties":["Psychiatric Medication Management","ADHD Evaluation","Psychopharmacologic Testing"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Garber-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"1","departmentId":"1","name":"Justin Gerstner, MD","provider_title":"Psychiatrist","credentials":"MD","specialty":"Psychiatry","specialties":["Psychiatric Medication Management","Transcranial Magnetic Stimulation","ADHD Evaluation","Psychopharmacologic Testing"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Gerstner-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"32","departmentId":"5","name":"Anna Grimm, LMFT","provider_title":"Individual Therapist","credentials":"LMFT","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/01/AnnaG-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"27","departmentId":"5","name":"Krystle Holliday, MA","provider_title":"Individual Therapist","credentials":"MA","specialty":"Therapy","specialties":["Mental Health Therapy","Family Therapy","Child Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Krystle-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"5","departmentId":"1","name":"Kirby Kaczor, LPCC","provider_title":"Individual and Couples Therapist","credentials":"LPCC","specialty":"Therapy","specialties":["Mental Health Therapy","Couples Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Kirby-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"18","departmentId":"8","name":"Anna King Laubach, LICSW","provider_title":"Individual and Couples Therapist","credentials":"LICSW","specialty":"Therapy","specialties":["Mental Health Therapy","Family Therapy","Couples Therapy","Teen Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Anna-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"39","departmentId":"8","name":"Ally Kuye, PMHNP","provider_title":"Psychiatric Nurse Practitioner","credentials":"PMHNP","specialty":"Psychiatry","specialties":["Psychiatric Medication Management"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/02/Ally-web.jpg","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"29","departmentId":"8","name":"Amber Madume, LPCC","provider_title":"Individual Therapist","credentials":"LPCC","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/01/Amber-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"6","departmentId":"1","name":"Demi Mancini, LPCC","provider_title":"Individual Therapist","credentials":"LPCC","specialty":"Therapy","specialties":["Mental Health Therapy","Child Therapy","Teen Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Demi-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"40","departmentId":"5","name":"Brooke McColl, MA","provider_title":"Individual Therapist","credentials":"MA","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/02/Brooke-M-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"13","departmentId":"1","name":"Ann Monson Slagle, PA-C","provider_title":"Psychiatric Physician Assistant","credentials":"PA-C","specialty":"Psychiatry","specialties":["Psychiatric Medication Management"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Ann-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"35","departmentId":"1","name":"Lisa Morgel Cryns, LMFT","provider_title":"Individual Therapist","credentials":"LMFT","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/01/LisaM-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"44","departmentId":"1","name":"Laura Mortenson, LICSW","provider_title":"Individual Therapist","credentials":"LICSW","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/04/Laura-M-2-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"7","departmentId":"1","name":"Lauren Nievinski, PA-C","provider_title":"Psychiatric Physician Assistant","credentials":"PA-C","specialty":"Psychiatry","specialties":["Psychiatric Medication Management"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Lauren-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"15","departmentId":"1","name":"Lola Oluwa-Okougbo, PMHNP","provider_title":"Psychiatric Nurse Practitioner","credentials":"PMHNP","specialty":"Psychiatry","specialties":["Psychiatric Medication Management"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Lola-Profile-scaled.jpg","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"38","departmentId":"5","name":"Steve Palmer, LMFT","provider_title":"Individual and Couples Therapist","credentials":"LMFT","specialty":"Therapy","specialties":["Mental Health Therapy","Couples Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/02/Steve-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"11","departmentId":"8","name":"Sara Polley, MD","provider_title":"Psychiatrist","credentials":"MD","specialty":"Psychiatry","specialties":["Psychiatric Medication Management"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Polley-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"23","departmentId":"8","name":"Brittany Reif-Wenner, LICSW","provider_title":"Individual and Couples Therapist","credentials":"LICSW","specialty":"Therapy","specialties":["Mental Health Therapy","Couples Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Brittany-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"14","departmentId":"5","name":"Julie Sabin, LPCC","provider_title":"Individual Therapist","credentials":"LPCC","specialty":"Therapy","specialties":["Mental Health Therapy","Child Therapy","Teen Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Julie-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"24","departmentId":"8","name":"Suzanne Shanklin, LPCC","provider_title":"Individual Therapist","credentials":"LPCC","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/SuzanneS-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"41","departmentId":"8","name":"Jennifer Tagg, LMFT","provider_title":"Individual and Couples Therapist","credentials":"LMFT","specialty":"Therapy","specialties":["Mental Health Therapy","Couples Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/03/Jtagg-hs-web.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"3","departmentId":"1","name":"Ashley Tix, LMFT","provider_title":"Individual and Couples Therapist","credentials":"LMFT","specialty":"Therapy","specialties":["Mental Health Therapy","Couples Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Ashley-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"25","departmentId":"8","name":"Rachel Whisney, MA","provider_title":"Individual Therapist","credentials":"MA","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Rachel-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"31","departmentId":"8","name":"Amanda Windyk, LICSW","provider_title":"Individual and Couples Therapist","credentials":"LICSW","specialty":"Therapy","specialties":["Mental Health Therapy","Family Therapy","Couples Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/01/Amanda-web-HS.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"17","departmentId":"5","name":"Karla Wise, LPCC","provider_title":"Individual Therapist","credentials":"LPCC","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2025/12/Karla-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"30","departmentId":"8","name":"Maryellen Zaborowski, LICSW","provider_title":"Individual Therapist","credentials":"LICSW","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/01/Maryellen-web-hs.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"46","departmentId":"1","name":"Gina Ashley, LPCC","provider_title":"Individual Therapist","credentials":"LPCC","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/04/Gina-web-Headshot.webp","sms_opt_in":false,"mobile_number":""},
  {"athena_provider_id":"33","departmentId":"8","name":"Hana Hassan, LPCC","provider_title":"Individual Therapist","credentials":"LPCC","specialty":"Therapy","specialties":["Mental Health Therapy"],"photo":"https://www.vantagementalhealth.org/wp-content/uploads/2026/04/Hana-web-hs.webp","sms_opt_in":false,"mobile_number":""}
];

const updated = base.map(p => {
  const x = xlMap[p.athena_provider_id] || { acceptingNew: true, minAge: 0, maxAge: 100, telehealthLocs: 'telehealth - mn', insurance: DEFAULT_INS, whatWeTreat: [], treatmentApproach: [], gender: 'Female', languages: ['English'] };
  return {
    ...p,
    acceptingNew:      x.acceptingNew,
    minAge:            x.minAge,
    maxAge:            x.maxAge,
    telehealthLocs:    x.telehealthLocs,
    insurance:         x.insurance,
    whatWeTreat:       x.whatWeTreat,
    treatmentApproach: x.treatmentApproach,
    gender:            x.gender,
    languages:         x.languages,
  };
});

const out = JSON.stringify(updated, null, 2);
// Validate
JSON.parse(out);

const frontendPath = 'C:/Users/samiu/Appointment Booking/frontend/src/data/provider-contacts.json';
const backendPath  = 'C:/Users/samiu/Appointment Booking/backend/provider-contacts.json';
fs.writeFileSync(frontendPath, out);
fs.writeFileSync(backendPath, out);
console.log('Written', updated.length, 'providers. JSON valid.');
