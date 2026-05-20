```
┌───────────────────────────────────────────────┐
                                       _       
     __ _  ___   ___  _ __ _ __ ___   (_) ___  
    / _` |/ _ \ / _ \| '__| '_ ` _ \  | |/ _ \ 
   | (_| | (_) | (_) | |  | | | | | |_| | (_) |
    \__, |\___/ \___/|_|  |_| |_| |_(_)_|\___/ 
    |___/                                      
			     🌩 𝘼𝙣𝙮𝙤𝙣𝙚 𝙘𝙖𝙣 𝙙𝙚𝙫𝙚𝙡𝙤𝙥!
└───────────────────────────────────────────────┘
```

# goormIDE
Welcome to goormIDE!

goormIDE is a powerful cloud IDE service to maximize productivity for developers and teams.  
**DEVELOP WITH EXCELLENCE**  

`Happy coding! The goormIDE team`


## 🔧 Tip & Guide

* Command feature
	* You can simply run your script using the shortcut icons on the top right.
	* Check out `PROJECT > Common/Build/Run/Test/Find Command` in the top menu.
	
* Get URL and Port
	* Click `PROJECT > URL/PORT` in top menu bar.
	* You can get default URL/Port and add URL/Port in the top menu.

* Useful shortcut
	
| Shortcuts name     | Command (Mac) | Command (Window) |
| ------------------ | :-----------: | :--------------: |
| Copy in Terminal   | ⌘ + C         | Ctrl + Shift + C |
| Paste in Terminal  | ⌘ + V         | Ctrl + Shift + V |
| Search File        | ⌥ + ⇧ + F     | Alt + Shift + F  |
| Terminal Toggle    | ⌥ + ⇧ + B     | Alt + Shift + B  |
| New Terminal       | ⌥ + ⇧ + T     | Alt + Shift + T  |
| Code Formatting    | ⌥ + ⇧ + P     | Alt + Shift + P  |
| Show All Shortcuts | ⌘ + H         | Ctrl + H         |

## 💬 Support & Documentation

Visit [https://ide.goorm.io](https://ide.goorm.io) to support and learn more about using goormIDE.  
To watch some usage guides, visit [https://help.goorm.io/en/goormide](https://help.goorm.io/en/goormide)
# asset-allocation-calculator
# AI Access Test

## 운영 팁: 같은 저장소 유지 + Netlify 배포 크레딧 절감

`main` 브랜치에서 `data/prices.json`, `data/economic.json`을 매일 갱신하면 Netlify가 변경을 감지해 production deploy를 수행합니다.  
같은 저장소를 유지하면서 이를 줄이려면 **코드와 데이터의 브랜치 역할을 분리**하세요.

- `main`: Netlify가 감시하는 사이트 코드(HTML/CSS/JS)
- `data`(또는 `gh-pages`): 매일 갱신되는 JSON 데이터 전용 브랜치

이 프로젝트의 `js/data-loader.js`는 `window.AAC_DATA_BASE_URL`이 있으면 해당 URL에서 JSON을 먼저 가져오고, 실패 시 기존 `./data`로 자동 폴백합니다.

예시(HTML `<head>`에서 `data-loader.js`보다 먼저 선언):

```html
<script>
  window.AAC_DATA_BASE_URL = 'https://<github-username>.github.io/asset-allocation-calculator/data';
</script>
```

권장 흐름:
1. GitHub Actions가 `data` 브랜치의 JSON만 업데이트/커밋
2. GitHub Pages가 `data` 브랜치를 공개
3. Netlify 사이트(`main`)는 외부 JSON URL만 fetch

이렇게 하면 같은 저장소를 유지하면서도, 데이터 갱신만으로 Netlify production deploy가 반복되는 구조를 피할 수 있습니다.
