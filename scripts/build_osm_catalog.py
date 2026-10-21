#!/usr/bin/env python3
"""Build BOR's offline venue catalog from the OSM Uzbekistan extract."""
import json,pathlib,tempfile,urllib.request
import osmium
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public'/'osm-tashkent.json'
URL='https://download.geofabrik.de/asia/uzbekistan-latest.osm.pbf'
class Venues(osmium.SimpleHandler):
 def __init__(self):
  super().__init__();self.by_id={}
 def capture(self,kind,ident,tags,latitude,longitude):
  if not(41.18<=latitude<=41.45 and 69.08<=longitude<=69.49):return
  category=tags.get('amenity')
  if category not in ('cafe','restaurant'):return
  name=(tags.get('name:ru') or tags.get('name') or '').strip()
  if not 2<=len(name)<=120:return
  address=', '.join(x for x in ((tags.get('addr:street') or '').strip(),(tags.get('addr:housenumber') or '').strip()) if x) or 'Адрес не указан в OpenStreetMap'
  district=(tags.get('addr:suburb') or tags.get('addr:district') or 'Ташкент').strip() or 'Ташкент'
  key=kind+'/'+str(ident)
  self.by_id[key]={'sourceId':key,'name':name,'district':district[:80],'address':address[:240],'category':category,'latitude':round(latitude,7),'longitude':round(longitude,7)}
 def node(self,n):
  if n.location.valid():self.capture('node',n.id,n.tags,n.location.lat,n.location.lon)
 def way(self,w):
  if w.tags.get('amenity') not in ('cafe','restaurant'):return
  coords=[(a.location.lat,a.location.lon) for a in w.nodes if a.location.valid()]
  if coords:self.capture('way',w.id,w.tags,sum(a for a,b in coords)/len(coords),sum(b for a,b in coords)/len(coords))
def main():
 with tempfile.TemporaryDirectory() as temp:
  path=pathlib.Path(temp)/'uzbekistan.osm.pbf'
  req=urllib.request.Request(URL,headers={'User-Agent':'BOR-venue-catalog/1.0 (OpenStreetMap ODbL)'})
  print('Downloading OSM Uzbekistan extract',flush=True)
  with urllib.request.urlopen(req,timeout=120) as r,open(path,'wb') as f:
   while True:
    part=r.read(1024*1024)
    if not part:break
    f.write(part)
  print('Downloaded MB:',round(path.stat().st_size/1024/1024,2),flush=True)
  if path.stat().st_size<100000:raise RuntimeError('OSM extract is unexpectedly small')
  handler=Venues();handler.apply_file(str(path),locations=True)
  if len(handler.by_id)<20:raise RuntimeError('OSM extract yielded fewer than 20 places; old data preserved')
  OUT.parent.mkdir(parents=True,exist_ok=True)
  OUT.write_text(json.dumps({'source':'OpenStreetMap/Geofabrik','attribution':'© OpenStreetMap contributors (ODbL)','area':'Ташкент','options':sorted(handler.by_id.values(),key=lambda p:p['name'].casefold())},ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
  print('Prepared',len(handler.by_id),'real venues',flush=True)
if __name__=='__main__':main()
