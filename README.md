# UMView Analytics

Dashboard do analizy wykorzystania środowisk akceptacyjnych na podstawie logów uruchomień `start–stop`.

Projekt powstał jako narzędzie wspierające analizę biznesowo-techniczną modeli utrzymania środowisk testowych. Jego głównym zadaniem jest przekształcenie surowych danych z plików CSV w czytelne wskaźniki i wizualizacje, które pozwalają ocenić rzeczywisty sposób korzystania ze środowiska, wykryć okresy bezczynności oraz porównać aktualny model pracy z hipotetycznym stałym harmonogramem.

> **Zakres prezentowanego rozwiązania:** głównym elementem projektu jest **Dashboard UMView Analytics**.  
> Moduły symulatora są jedynie prototypami pomocniczymi używanymi podczas analizy i nie stanowią części prezentowanego rozwiązania.

---

## Cel projektu

UMView Analytics odpowiada na pytania:

- jak często środowisko jest uruchamiane;
- ile czasu faktycznie pozostaje aktywne;
- czy aktywność ma charakter sporadyczny, cykliczny, kampanijny czy nieregularny;
- czy występują długie sesje lub równoległe uruchomienia;
- ile aktywności przypada poza standardowe godziny pracy;
- czy stały harmonogram, np. `08:00–16:00` od poniedziałku do piątku, byłby dobrze wykorzystany;
- gdzie mogą występować puste okna dostępności i nieefektywność operacyjna.

Dashboard nie wylicza automatycznie realnej oszczędności budżetowej. Pokazuje mierzalne wzorce wykorzystania i dostarcza danych wejściowych do dalszej wyceny kosztów infrastruktury, pracy DevOps oraz przyszłych warunków umowy.

---

## Najważniejsze funkcje Dashboardu

### Import i walidacja danych CSV

Aplikacja umożliwia wczytanie pliku CSV bezpośrednio z interfejsu.

Obsługiwane są:

- separatory `;`, `,` oraz tabulator;
- kodowanie UTF-8 i Windows-1250;
- różne warianty nazw kolumn;
- daty w formacie `DD.MM.RRRR GG:MM`;
- opcjonalne kolumny z osobą uruchamiającą, powodem i liczbą godzin.

Do analizy wymagane są co najmniej kolumny określające początek i koniec sesji. Niepoprawne rekordy, wiersze podsumowań i sesje bez prawidłowego przedziału czasu są pomijane.

### Analiza przedziałów czasowych

Dashboard nie opiera się wyłącznie na wartości „Godziny” zapisanej w pliku. Czas każdej sesji jest obliczany z rzeczywistych znaczników `start–stop`.

Mechanizm analityczny:

- rozdziela sesje przechodzące przez północ na właściwe dni;
- scala nakładające się przedziały;
- zapobiega podwójnemu zliczaniu aktywnego czasu;
- odróżnia sumę długości sesji od unikalnego czasu aktywności;
- wykrywa czas, w którym działały co najmniej dwie sesje równolegle;
- buduje pełną oś czasu, również z dniami bez aktywności.

### KPI

Dashboard wyświetla najważniejsze wskaźniki:

- **Sesje** — liczba ciągłych przedziałów `start–stop`;
- **Aktywne dni robocze** — liczba dni roboczych z aktywnością w stosunku do wszystkich dni roboczych w okresie;
- **Suma godzin sesji** — łączna długość wszystkich sesji;
- **Czas aktywny bez dubli** — unikalny czas pracy po scaleniu nakładających się przedziałów;
- **Współbieżność** — unikalny czas, w którym działały co najmniej dwie sesje;
- **Średnia długość sesji**;
- **Mediana długości sesji**;
- **Odchylenie standardowe**;
- **Najdłuższa sesja**;
- **Maksymalna aktywność dobowa**.

Rozdzielenie metryk sesji i aktywności dziennej jest ważne szczególnie dla sesji wielodniowych oraz przypadków, w których kilka uruchomień nakłada się na siebie.

---

## Wyjaśnienie wizualizacji

### Timeline aktywności

Wykres pokazuje liczbę godzin aktywności w kolejnych dniach kalendarzowych.

Uwzględnia również dni z wartością `0h`, dzięki czemu widoczne są:

- serie intensywnych testów;
- długie przerwy między uruchomieniami;
- okresy kampanijne;
- pojedyncze dni o wyjątkowo wysokiej aktywności.

Pionowe linie oddzielają miesiące, a pomarańczowy znacznik wskazuje dzień z największą unikalną aktywnością.

### Histogram długości sesji

Histogram grupuje sesje w dwugodzinne przedziały:

- `0–2h`;
- `2–4h`;
- `4–6h`;
- itd.;
- `16h+`.

Pozwala szybko ocenić, czy typowa sesja jest krótka, zbliżona do pełnego dnia pracy, czy też w danych występuje długi ogon bardzo długich sesji.

### Heatmap aktywności: dzień × godzina

Heatmap pokazuje, w jakich dniach tygodnia i godzinach najczęściej występowała aktywność.

- wiersze oznaczają dni tygodnia;
- kolumny oznaczają godziny od `00:00` do `23:00`;
- ciemniejszy kolor oznacza większą łączną aktywność.

Sesje wielodniowe są dzielone na właściwe dni i godziny, a nakładające się przedziały nie są liczone podwójnie.

Heatmap pomaga sprawdzić, czy środowisko jest używane głównie w standardowych godzinach pracy, czy również rano, wieczorem, nocą lub w weekendy.

### Profil tygodnia

Widok sumuje aktywność dla poszczególnych dni tygodnia i wskazuje dzień o największym obciążeniu.

Pozwala zauważyć, czy testy koncentrują się np. na początku tygodnia, przed wydaniami lub w określonych dniach roboczych.

### Profil miesiąca

Widok prezentuje łączny czas aktywności w kolejnych miesiącach i wyróżnia miesiąc o największym obciążeniu.

Ułatwia rozpoznanie:

- sezonowości;
- okresów kampanii;
- miesięcy bez aktywności;
- wzrostu lub spadku intensywności testów.

### Przecięcia sesji

Panel wykrywa dni, w których co najmniej dwie sesje działały równolegle.

Po wybraniu dnia wyświetlany jest wykres typu Gantt:

- każda belka przedstawia jedną sesję;
- oś pozioma pokazuje godziny doby;
- czerwone obszary oznaczają rzeczywisty czas nakładania się sesji.

Współbieżność jest liczona jako unikalny czas z co najmniej dwiema aktywnymi sesjami. Dzięki temu wynik nie jest zawyżany przy trzech lub większej liczbie równoległych przedziałów.

### Macierz obciążenia: dni × miesiące

Tabela krzyżowa pokazuje łączną liczbę godzin dla każdego połączenia:

- dnia tygodnia;
- miesiąca.

Gradient koloru wskazuje intensywność wykorzystania. Wiersze i kolumny zawierają sumy, a największe wartości są dodatkowo wyróżnione.

Macierz pomaga porównać wzorce tygodniowe i miesięczne w jednym widoku.

---

## Porównanie z hipotetycznym Modelem A

Dashboard zawiera rozwijany panel porównawczy dla stałego harmonogramu:

```text
poniedziałek–piątek, 08:00–16:00
```

Panel oblicza:

- **udział aktywnych dni roboczych**;
- **wykorzystanie okna** — rzeczywisty czas aktywności mieszczący się w harmonogramie;
- **przestój w oknie** — część stałego harmonogramu bez aktywności;
- **aktywność poza oknem** — godziny, których harmonogram `08:00–16:00` nie obejmuje.

Jest to porównanie analityczne, a nie bieżące rozliczenie kosztowe. Pozwala sprawdzić, czy model cykliczny byłby dopasowany do realnego wykorzystania środowiska.

Godziny okna można zmienić w kodzie:

```js
const MODEL_A_START_HOUR = 8;
const MODEL_A_END_HOUR = 16;
```

---

## Format danych wejściowych

Przykładowy plik CSV:

```csv
Start date;Stop date;Uruchamiający;Powód
09.02.2026 08:30;09.02.2026 13:30;KM;Testy nowej wersji
10.02.2026 08:30;10.02.2026 16:00;KM;Testy poprawki
```

Wymagane pola:

| Pole | Znaczenie |
|---|---|
| `Start date` | data i godzina uruchomienia |
| `Stop date` | data i godzina zakończenia |

Pola opcjonalne:

| Pole | Znaczenie |
|---|---|
| `Uruchamiający` | osoba lub zespół uruchamiający |
| `Powód` / `Komentarz` | przyczyna uruchomienia |
| `Godziny` | wartość źródłowa do porównania; obliczenia bazują na `start–stop` |

---

## Zastosowane podejście techniczne

Projekt wykorzystuje:

- **React** — interfejs i zarządzanie stanem;
- **Recharts** — wykresy i wizualizacje;
- **Lucide React** — ikony;
- komponentowy podział interfejsu;
- `useMemo` do obliczeń zależnych od danych;
- `useCallback` do obsługi importu;
- własny parser CSV;
- algorytmy scalania i przecinania przedziałów czasowych;
- analizę statystyczną: średnia, mediana i odchylenie standardowe;
- responsywny układ dostosowany do różnych szerokości ekranu.

---

## Najważniejsze elementy implementacji

### Scalanie przedziałów

Nakładające się sesje są scalane przed obliczeniem aktywnego czasu. Dzięki temu godzina, w której działały dwie sesje, nie jest automatycznie liczona jako dwie godziny wykorzystania środowiska.

### Wykrywanie współbieżności

Aplikacja tworzy zdarzenia rozpoczęcia i zakończenia sesji, porządkuje je chronologicznie, a następnie wskazuje odcinki czasu z co najmniej dwiema aktywnymi sesjami.

### Obsługa sesji wielodniowych

Każda sesja przechodząca przez północ jest rozdzielana na części przypisane do odpowiednich dni. Jest to wykorzystywane w Timeline, Heatmapie, aktywności dobowej i tabelach.

### Odporność na dane wejściowe

Parser:

- rozpoznaje separator;
- normalizuje polskie znaki i nazwy nagłówków;
- obsługuje dwa kodowania;
- pomija nieprawidłowe rekordy;
- sprawdza poprawność dat i kolejność `start < stop`.

---

## Ograniczenia

- Dashboard analizuje dane dostępne w przesłanym pliku i nie łączy się bezpośrednio z systemami chmurowymi.
- Nie wylicza rzeczywistego kosztu AWS bez danych o stawkach i strukturze kosztów.
- Nie uwzględnia kosztu pracy DevOps bez informacji o czasie obsługi i stawce roboczogodziny.
- Porównanie z Modelem A zależy od przyjętego okna godzinowego.
- Wyniki dla środowisk bez logów `start–stop` nie mogą być obliczone w ten sam sposób.

---

## Moduły prototypowe

W repozytorium mogą znajdować się dodatkowe moduły:

- `DataModelSimulator`;
- `NoDataModelSimulator`.

Zostały przygotowane jako prototypowe narzędzia pomocnicze do sprawdzania scenariuszy analitycznych. Nie są głównym produktem projektu i nie będą prezentowane jako część finalnego Dashboardu.

---

---------------------------------------------------------------

_**Creator: Anastasiia Bzova © 2026 **_

Projekt przygotowany w ramach analizy biznesowo-technicznej optymalizacji wykorzystania środowisk akceptacyjnych.
