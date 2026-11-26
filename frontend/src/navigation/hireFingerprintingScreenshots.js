// Original user-supplied screenshots are private objects; this manifest contains no image bytes.
export const FINGERPRINTING_SCREENSHOTS = Object.freeze([
  {
    "sha256": "9f655c018efb1b6cfffe09edc3b068d389ec237d6239aaf65526847d22d0677d",
    "stepTitle": "Open Cabiond",
    "caption": "Cabiond sign-in page.",
    "originalSequence": 2
  },
  {
    "sha256": "6cd78faf9a19f86ff3cc2b5e1c3dc68f4e838309195d93dd0ebf0692e21eb072",
    "stepTitle": "Create an account if you need one",
    "caption": "Use Create an Account if you have not registered.",
    "originalSequence": 1
  },
  {
    "sha256": "ac2e734f7ac08463bbee1eb12d5b394a2dbf7777e4caaeebcfbb82079a3ed8fe",
    "stepTitle": "Sign in to your account",
    "caption": "Example account home after signing in.",
    "originalSequence": 9
  },
  {
    "sha256": "9df6400ffcb9f83aa46183edd000c30bcd07d3e888f0e0fd0dd59d4a7555733e",
    "stepTitle": "Place a new order",
    "caption": "Choose Place New Order.",
    "originalSequence": 8
  },
  {
    "sha256": "c8334688f6bc8a6e56cb311114894231fc8ea9e1ae185b9fb9d3726ef27fc08c",
    "stepTitle": "Choose the location closest to home",
    "caption": "Choose the fingerprinting location nearest your home.",
    "originalSequence": 7
  },
  {
    "sha256": "3cad436f298a07513e78d01c4909d0d219884db73f156441e375d011142a9020",
    "stepTitle": "Choose the location closest to home",
    "caption": "Example appointment details. Choose your own location, date and time.",
    "originalSequence": 3
  },
  {
    "sha256": "6d6c9fa72bae4d825cfb190fd562a3ea5f6bfe61e592f0d3833843a501026495",
    "stepTitle": "Select No for the billing code",
    "caption": "Select No when asked whether you have a billing code.",
    "originalSequence": 6
  },
  {
    "sha256": "8abf5cf74ba8134b421aaababf40cee3b1635a15ebf45966d17cad1dec9d5e3b",
    "stepTitle": "Order one fingerprint card",
    "caption": "Choose Fingerprinting Cards for non-CBI purposes and one copy.",
    "originalSequence": 5
  },
  {
    "sha256": "0757cc23169c389cc843289a25cc7a5ceae29b75748670cd96407c0717502b70",
    "stepTitle": "Ship the card to ITSCO",
    "caption": "Ship to ITSCO, attention Rachel Finch, using First Class Mail.",
    "originalSequence": 4
  }
]);

export function addFingerprintingScreenshots(html) {
  let result = String(html || '');
  for (const heading of new Set(FINGERPRINTING_SCREENSHOTS.map(item => item.stepTitle))) {
    const figures = FINGERPRINTING_SCREENSHOTS.filter(item => item.stepTitle === heading
      && !result.includes('data-fingerprinting-screenshot="' + item.sha256 + '"')).map(item =>
      '<figure><img data-fingerprinting-screenshot="' + item.sha256 + '" alt="' + item.caption + '" />'
      + '<figcaption>Example screen: ' + item.caption + '</figcaption></figure>').join('');
    const marker = '<h3>' + heading + '</h3>';
    if (figures) result = result.replace(marker, marker + figures);
  }
  return result;
}
