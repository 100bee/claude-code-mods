# chat-theme

내 메시지와 Claude 답변을 **색 있는 제목 줄과 테두리**로 감싸서 채팅처럼 보이게 하는 mod입니다. 메시지 내용(마크다운, 코드 블록, 표)은 Claude Code가 원래 그리는 그대로 두고 바깥만 감쌉니다.

테두리는 흐린 색, 제목만 진한 색 + 굵게 그려서 상자는 차분하고 누가 말했는지는 바로 보입니다.

기본값(box)은 둥근 상자이고, 제목은 상자 안 첫 줄에 들어갑니다.

```
╭──────────────────────────────────╮    ← 나 (기본: 하늘색)
│ 나                               │
│ 로그인 API 에러 좀 봐줘          │
╰──────────────────────────────────╯
╭──────────────────────────────────╮    ← Claude (기본: 주황, Claude 색)
│ Claude                           │
│ AuthService.java 42번 줄에서 …   │
╰──────────────────────────────────╯
```

line 방식은 위아래 줄만 긋습니다.

```
╭─ Claude ─────────────────────────
AuthService.java 42번 줄에서 토큰 만료 체크가 빠져 있어요.
╰──────────────────────────────────
```

## 설치

Claude Code 터미널의 프롬프트에서:

```
/plugin install chat-theme --marketplace 100bee/claude-code-mods
```

`Add marketplace?`에 `y`, 설치 범위는 `user`에서 Enter. 재시작 없이 바로 동작합니다. Claude Code v2.1.287 이상.

## 명령

`/theme`는 Claude Code에 이미 있는 명령이라 `/theme-chat`을 씁니다.

- `/theme-chat default`: 나 하늘색 / Claude 주황 (기본값)
- `/theme-chat spring | summer | autumn | winter`: 사계절 팔레트 (고르면 그 계절로 고정)
- `/theme-chat auto`: 날짜에 맞춰 지금 계절 팔레트. 3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울
- `/theme-chat box`: 둥근 상자로 감싸기 (기본값)
- `/theme-chat line`: 위아래 색 줄로만 감싸기. 본문 폭이 줄지 않고, 복사할 때 테두리 문자가 섞이지 않음
- `/theme-chat on | off`: 켜기/끄기
- `/theme-chat`: 지금 설정 확인

| 팔레트 | 나 | Claude |
|---|---|---|
| default (기본값) | 하늘색 `#5ec8f2` | 주황(Claude 색) `#d97757` |
| spring (봄) | 새싹 연두 `#9fd67a` | 벚꽃 연분홍 `#f7a8c4` |
| summer (여름) | 해바라기 노랑 `#ffd23f` | 바다 파랑 `#3fa7e0` |
| autumn (가을) | 단풍 빨강 `#d9453b` | 낙엽 갈색 `#b5835a` |
| winter (겨울) | 눈 흰색 `#e8eef2` | 얼음 하늘색 `#a8d8f0` |

사계절끼리는 색이 겹치지 않게 골랐습니다. 겨울의 눈 흰색은 밝은 배경 터미널에서 흐리게 보일 수 있습니다.

## 0.2.0에서 바뀐 것

- box 방식: 0.1과 같은 상자 (제목을 윗 테두리에 넣는 방식은 Box가 `borderTop`을 받지 않아 되돌림. 안쪽 여백 `paddingX`·폭 `width`도 실제 화면에서 상자가 안 그려져서 뺌)
- 팔레트마다 제목 색과 테두리 색을 나눔 (테두리는 같은 색을 배경 쪽으로 흐리게)
- 팔레트를 default(예전 ocean, 기본값) + 사계절(spring·summer·autumn·winter) + `auto`(지금 계절)로 정리. sunset·forest·mono·catppuccin·dracula·nord는 서로 색이 겹쳐서 지움. 쓰던 중이면 default로 바뀜
- 다른 mod(사이드바 등)가 고른 팔레트 색을 읽을 수 있게 공개 (`chat-theme.colors`)
- 한글 폭 버그 수정: "나"를 1칸으로 세서 line 방식 윗줄이 한 칸 길게 나오던 문제
- line 방식 선 길이: 창 너비 − `GUTTER`(기본 2칸)까지 그리고, 사이드바 때문에 자리가 좁으면 잘라냄. 예전 line은 최대 60칸이었음

## 안 먹으면

Claude Code는 Box·Text가 받지 않는 prop이 하나라도 있으면 그 훅을 통째로 건너뛰고 메시지를 원래 모양으로 그립니다. 이유는 debug 로그(`claude --debug`)에만 남는 경우가 많습니다. 0.2.0 초기 코드가 Box에 `borderTop={false}`를 넘겨서 테마가 전혀 안 보였던 것도, `width`·`paddingX`를 넣었을 때 상자가 안 쳐졌던 것도 이 때문입니다. 지금은 0.1에서 실제로 그려졌던 `flexDirection`, `borderStyle`, `borderColor`만 씁니다. 테스트(`claude plugin test`)는 이런 거절을 잡지 못하니 실제 화면에서 확인하세요.

- box가 안 되면 `/theme-chat line`으로 바꾸세요. Box에 `flexDirection`만 넘깁니다.
- 줄 끝이 다음 줄로 넘어가 보이면 `hooks/register.tsx`의 `GUTTER`를 1~2 늘리세요.

색은 `hooks/register.tsx`의 `PALETTES`에서 바꿀 수 있습니다.
