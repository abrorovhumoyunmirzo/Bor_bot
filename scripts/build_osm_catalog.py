#!/usr/bin/env python3
"""Refresh BOR venue cache outside the mobile request path."""
import json,urllib.request,urllib.parse,concurrent.futures,pathlib,sys
OUT=pathlib.Path(__file__).resolve().parents[1]/'public'/'osm-tashkent.json'
ENDPOINTS=['https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter','https://overpass.nchc.org.tw/api/interpreter']
BOXES=[(41.255,69.17,41.31,69.245),(41.30,69.23,41.36,69.315),(41.26,69.30,41.33,69.39),(41.34,69.20,41.39,69.34)]
def fetch(box,endpoint):
 s,w,n,e=box
 query=f'[out:json][timeout:16];(nwr["amenity"~"^(cafe|restaurant)$"]["name"]({s},{w},{n},{e}););out center 300;'
 req=urllib.request.Request(endpoint,data=urllib.parse.urlencode({'data':query}).encode(),headers={'Content-Type':'application/x-www-form-urlencoded','User-Agent':'BOR-OSM-catalog/1.0'})
 with urllib.request.urlopen(req,timeout=22) as response:doc=json.load(response)
 if not isinstance(doc.get('elements'),list):raise ValueError('Invalid response')
 out=[]
 for item in doc['elements']:
  t=item.get('tags') or {}
  lat=item.get('lat',(item.get('center') or {}).get('lat'));lon=item.get('lon',(item.get('center') or {}).get('lon'))
  name=(t.get('name:ru') or t.get('name') or '').strip()
  category=t.get('amenity')
  if len(name)<2 or len(name)>120 or not isinstance(lat,(float,int)) or not isinstance(lon,(float,int)) or category not in ('cafe','restaurant'):continue
  address=', '.join(p for p in ((t.get('addr:street') or '').strip(),(t.get('addr:housenumber') or '').strip()) if p) or 'Адрес не указан в OpenStreetMap'
  district=(t.get('addr:suburb') or t.get('addr:district') or 'Ташкент').strip() or 'Ташкент'
  out.append(dict(sourceId=item['type']+'/'+str(item['id']),name=name,district=district[:80],address=address[:240],category=category,latitude=lat,longitude=lon))
 return out
def main():
 venues={}
 for i,box in enumerate(BOXES):
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
   futures={pool.submit(fetch,box,url):url for url in ENDPOINTS}
   try:
    for future in concurrent.futures.as_completed(futures,timeout=29):
     try:
      batch=future.result()
      if batch:
       print('Area',i,'count',len(batch),flush=True)
       venues.update((item['sourceId'],item) for item in batch)
       break
     except Exception as exc:print('Mirror failed:',type(exc).__name__,flush=True)
   except concurrent.futures.TimeoutError:pass
 if len(venues)<10:
  print('OpenStreetMap unavailable; existing catalog unchanged',file=sys.stderr)
  sys.exit(1)
 OUT.parent.mkdir(parents=True,exist_ok=True)
 OUT.write_text(json.dumps(dict(source='OpenStreetMap',attribution='© OpenStreetMap contributors (ODbL)',area='Ташкент',options=sorted(venues.values(),key=lambda p:p['name'].casefold())),ensure_ascii=False)+'\n',encoding='utf-8')
 print('Saved',len(venues),'venues')
if __name__=='__main__':main()
