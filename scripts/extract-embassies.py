"""Extract supplied cell values without evaluating formulas or external links."""
import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

SOURCE = Path('data/raw/prazska_diplomaticka_zastoupeni_pracovni.xlsx')
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
COUNTRIES = dict(zip(
    ['Afghánistán','Albánie','Alžírsko','Argentina','Arménie','Austrálie','Bahamy','Belgie','Bhútán','Bosna a Hercegovina','Brazílie','Bělorusko','Chile','Chorvatsko','Estonsko','Finsko','Indie','Indonésie','Island','Izrael','Jižní Korea','Kazachstán','Kolumbie','Kuba','Libanon','Libye','Malta','Mauricius','Maďarsko','Mexiko','Myanmar','Namibie','Norsko','Německo','Omán','Palestina','Polsko','Pákistán','Rakousko','Rusko','Rwanda','San Marino','Severní Korea','Severní Makedonie','Singapur','Slovensko','Spojené arabské emiráty','Svatý stolec','Sýrie','Turecko','Ukrajina','Uruguay','USA','Uzbekistán','Ázerbájdžán','Čína'],
    ['af','al','dz','ar','am','au','bs','be','bt','ba','br','by','cl','hr','ee','fi','in','id','is','il','kr','kz','co','cu','lb','ly','mt','mu','hu','mx','mm','na','no','de','om','ps','pl','pk','at','ru','rw','sm','kp','mk','sg','sk','ae','va','sy','tr','ua','uy','us','uz','az','cn'], strict=True))
TYPES = {'Velvyslanectví':'embassy','Konzulární oddělení':'consular_department','Honorární konzulát':'honorary_consulate','Honorární generální konzulát':'honorary_consulate_general','Apoštolská nunciatura':'apostolic_nunciature'}

def rows(archive, name, strings):
    result = []
    for row in ET.fromstring(archive.read(name)).findall('.//s:sheetData/s:row', NS):
        values = {}
        for cell in row:
            value = cell.find('s:v', NS)
            inline = cell.find('s:is', NS)
            text = value.text if value is not None else ''.join(inline.itertext()) if inline is not None else ''
            if cell.get('t') == 's':
                text = strings[int(text)]
            values[''.join(c for c in cell.get('r') if c.isalpha())] = text or ''
        result.append((int(row.get('r')), values))
    return result

with ZipFile(SOURCE) as archive:
    strings = [''.join(item.itertext()) for item in ET.fromstring(archive.read('xl/sharedStrings.xml'))] if 'xl/sharedStrings.xml' in archive.namelist() else []
    offices = rows(archive, 'xl/worksheets/sheet1.xml', strings)
    assert [offices[0][1].get(c) for c in 'ABCDEFG'] == ['Název úřadu','Zastupovaná země','Typ úřadu','Adresa','Zeměpisná šířka','Zeměpisná délka','Zdroj / strana']
    records = []
    for number, value in offices[1:]:
        if not value.get('A'):
            continue
        country, kind = COUNTRIES[value['B']], TYPES[value['C']]
        assert not value.get('E') and not value.get('F'), 'New supplied coordinates require explicit verification.'
        records.append({'id':f'embassy:{country}:{kind}','name':value['A'],'country':value['B'],'countryCode':country,'officeType':kind,'address':value['D'],'sourceRow':number,'sourceText':value['G'],'sourcePage':int(value['G'].rsplit(' ',1)[-1])})
    methodology = {v['A']:v.get('B','') for _,v in rows(archive,'xl/worksheets/sheet2.xml',strings)[1:]}
assert len(records) == 60 and len({r['id'] for r in records}) == 60
output = {'format':'jetlag-embassy-selection-v1','sourceFile':SOURCE.name,'sourceChecksum':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'sourceUrl':methodology['Oficiální zdroj'],'dataDate':'2026-10-22','methodology':methodology,'records':records}
Path('data/raw/embassies-selection.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'records':len(records),'originalChecksum':output['sourceChecksum']},ensure_ascii=False))
