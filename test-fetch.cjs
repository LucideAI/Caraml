const fs = require('fs');
fetch('http://localhost:3001/api/learn-ocaml/exercise-raw/tp6/unionfind', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    serverUrl: 'https://pf2.informatique.u-paris.fr',
    token: 'O1O-GOX-YEF-VWZ'
  })
}).then(r => r.json()).then(d => {
  const ex = d[1] || d;
  console.log('Exercise object keys:', Object.keys(ex));
  console.log('Has test:', !!ex.test);
  console.log('Length of test:', ex.test ? ex.test.length : 0);
  console.log('Has solution:', !!ex.solution);
  if (ex.dependencies) console.log('Dependencies:', ex.dependencies);
  // Also check if there's any other field named test-something
  console.log('All fields:', Object.keys(ex).join(', '));
}).catch(console.error);
