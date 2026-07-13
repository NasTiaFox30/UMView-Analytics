Instrukcja Obsługi: UMView Analytics
(osobisty symulator analizy)

Ważna uwaga na start: Aplikacja przyjmuje wyłącznie pliki w formacie CSV. Aby rozpocząć analizę, wyeksportuj tabelę z raportu (zawierającą daty, godziny i powody uruchomienia) do pliku .csv i załaduj ją do programu.


1. Dashboard (Analiza Danych)
    • Wgraj plik CSV: System automatycznie odczyta logi.
    • Odczytaj wykresy: Przeanalizuj rozkład godzinowy i matrycę obciążenia (Pivot). Dni o ekstremalnym, największym obciążeniu są automatycznie podświetlane na pomarańczowo.
2. Symulator „Założenia” (Kalkulator symulacji)
Użyj panelu bocznego, aby zmieniać stawki roboczogodzin (chmura AWS, czas DevOps) oraz dostosowywać harmonogramy. Program w czasie rzeczywistym przeliczy koszty i wskaże najtańszą opcję.
Jak aplikacja wylicza modele optymalizacji?
Dla pełnego obrazu program porównuje cztery podejścia. Model A to klasyczna praca ciągła (droga chmura, dużo przestojów), a Model B to ręczne włączanie na żądanie (tania chmura, ale drogi czas pracy ludzi).
Najważniejsze do zrozumienia są jednak dwa zaawansowane modele (dodane osobiście), które symulator analizuje pod kątem największych oszczędności:
    • Model H (Hybrydowy)
        ○ Logika: Jest to kompromis. Definiujesz krótki, sztywny harmonogram tylko na najbardziej obciążone dni (tzw. baza). Wszelkie nieprzewidziane testy poza tym harmonogramem uruchamiasz ręcznie na żądanie.
        ○ Jak to liczymy: Program weryfikuje pojemność zaplanowanej bazy. Jeśli testy z pliku CSV się w niej zmieszczą – koszt jest stały. Jeśli zapotrzebowanie przekroczy bazę, każda nadmiarowa aktywacja doliczana jest po wysokiej stawce ręcznego włączenia.
        ○ Wzór:
        


    • Model S (Scale-to-Zero)
        ○ Logika: Pełna, nowoczesna automatyzacja. Koszt pracy inżynierów (DevOps) wynosi tu 0 zł. Serwery włączają się same po wykryciu aktywności i wyłączają automatycznie po określonym czasie bezczynności (timeout).
        ○ Jak to liczymy: Płacisz wyłącznie za rzeczywisty czas trwania testów z pliku CSV, powiększony jedynie o czas, w którym serwer "czekał" na uśpienie po zakończeniu pracy.