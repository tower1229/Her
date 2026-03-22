import * as fs from 'fs';
import * as path from 'path';

export async function getHoliday(dateStr: string, countryCode = 'CN'): Promise<string | null> {
  try {
    const datePattern = /^(\d{4})-(\d{2})-(\d{2})/;
    const dateMatch = dateStr.match(datePattern);
    if (!dateMatch) return null;

    const year = dateMatch[1];
    const targetDate = `${year}-${dateMatch[2]}-${dateMatch[3]}`;

    const cacheDir = path.join(__dirname, '.cache');
    const cacheFile = path.join(cacheDir, `holidays-${year}-${countryCode}.json`);

    let holidaysData: { date: string; name: string }[] = [];

    if (fs.existsSync(cacheFile)) {
      holidaysData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } else {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

      const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      holidaysData = await response.json();
      fs.writeFileSync(cacheFile, JSON.stringify(holidaysData));
    }

    const found = holidaysData.find((h: any) => h.date === targetDate);
    return found ? found.name : null;
  } catch (error) {
    // Fail semi-silently returning null is appropriate for write consistency guarantees.
    return null;
  }
}
