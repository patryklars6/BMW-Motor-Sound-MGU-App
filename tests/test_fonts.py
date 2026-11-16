import json,re,unittest,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class FontCoverage(unittest.TestCase):
 def test_translations_and_language_autonyms_render_in_every_label_and_bold_size(self):
  source=(ROOT/'apps/patryklars6_motor_sound/translations.js').read_text(encoding='utf-8')
  catalog=json.loads(re.search(r'module.exports = (\{.*\});',source,re.S).group(1))
  text=''.join(catalog)+''.join(v for pair in catalog.values() for v in pair)+'Türkçe English Deutsch ÄÖÜäöüß ÇçĞğİıÖöŞşÜü'
  required={str(ord(char)) for char in text if not char.isspace()}
  with zipfile.ZipFile(ROOT/'vendor/luxo-fonts.zip') as archive:
   for family in ['label','bold']:
    data=json.loads(archive.read(family+'.json'))
    for size in data['sizes']:
     missing=required-set(size['glyphs'])
     self.assertFalse(missing,(family,size['size'],''.join(chr(int(c)) for c in sorted(missing))))
if __name__=='__main__':unittest.main()
