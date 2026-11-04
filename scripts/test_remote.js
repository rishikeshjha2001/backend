async function test() {
  try {
    const res = await fetch('https://happylokam.com/api/v1/sections');
    const data = await res.json();
    console.log('STATUS:', res.status);
    console.log('SECTIONS DATA:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Fetch error:', err.message);
  }

  try {
    const res = await fetch('https://happylokam.com/api/v1/categories');
    const data = await res.json();
    console.log('CATEGORIES DATA:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Categories error:', err.message);
  }
}

test();
