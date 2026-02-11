const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const app = express();

const PORT = process.env.PORT || 3000;
const CURRENCIES_FILE = path.join(__dirname, 'currencies.json');

// Middleware
app.use(cors());
app.use(express.json());

// ✅ 1. Инициализация базы данных курсов
async function initializeCurrencies() {
  try {
    await fs.access(CURRENCIES_FILE);
    console.log('✅ База курсов уже существует');
  } catch (error) {
    // Создаем начальные курсы
    const initialCurrencies = {
      currencies: [
        {
          id: 1,
          code: "JDC",
          name: "Jedi Coin",
          symbol: "ⓙ",
          rates: {
            "IO": 3,
            "RUB": 150
          }
        },
        {
          id: 2,
          code: "IO",
          name: "Ionian Orb",
          symbol: "ⓞ",
          rates: {
            "JDC": 0.3333,
            "RUB": 50
          }
        },
        {
          id: 3,
          code: "RUB",
          name: "Российский рубль",
          symbol: "₽",
          rates: {
            "JDC": 0.0067,
            "IO": 0.02
          }
        }
      ],
      lastUpdated: new Date().toISOString(),
      version: "1.0"
    };
    
    await fs.writeFile(CURRENCIES_FILE, JSON.stringify(initialCurrencies, null, 2));
    console.log('✅ База курсов создана');
  }
}

// ✅ 2. Чтение курсов из файла
async function readCurrencies() {
  try {
    const data = await fs.readFile(CURRENCIES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка чтения файла курсов:', error);
    return { currencies: [], lastUpdated: null };
  }
}

// ✅ 3. Запись курсов в файл
async function writeCurrencies(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    await fs.writeFile(CURRENCIES_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Ошибка записи файла курсов:', error);
    return false;
  }
}

// ✅ 4. Маршруты API

// Главная страница
app.get('/', (req, res) => {
  res.json({
    message: '🏦 API кастомных валют',
    description: 'Управление курсами ваших валют',
    version: '1.0.0',
    endpoints: {
      all_currencies: 'GET /api/currencies',
      specific_currency: 'GET /api/currencies/:code',
      convert: 'GET /api/convert?from=JDC&to=IO&amount=100',
      add_currency: 'POST /api/currencies',
      update_rate: 'PUT /api/currencies/:code/rates/:target',
      delete_currency: 'DELETE /api/currencies/:code'
    },
    example_currencies: {
      JDC: 'Jedi Coin (1 JDC = 3 IO = 150₽)',
      IO: 'Ionian Orb (1 IO = 0.333 JDC = 50₽)',
      RUB: 'Российский рубль (1₽ = 0.0067 JDC = 0.02 IO)'
    }
  });
});

// Получить все валюты
app.get('/api/currencies', async (req, res) => {
  try {
    const data = await readCurrencies();
    res.json({
      success: true,
      count: data.currencies.length,
      lastUpdated: data.lastUpdated,
      currencies: data.currencies
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить конкретную валюту
app.get('/api/currencies/:code', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const data = await readCurrencies();
    const currency = data.currencies.find(c => c.code === code);
    
    if (!currency) {
      return res.status(404).json({
        success: false,
        error: `Валюта ${code} не найдена`
      });
    }
    
    res.json({
      success: true,
      currency: currency
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Конвертация валют
app.get('/api/convert', async (req, res) => {
  try {
    const { from, to, amount = 1 } = req.query;
    
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: 'Укажите параметры from и to'
      });
    }
    
    const data = await readCurrencies();
    const fromCurrency = data.currencies.find(c => c.code === from.toUpperCase());
    const toCurrency = data.currencies.find(c => c.code === to.toUpperCase());
    
    if (!fromCurrency || !toCurrency) {
      return res.status(404).json({
        success: false,
        error: 'Одна из валют не найдена'
      });
    }
    
    const rate = fromCurrency.rates[to];
    
    if (rate === undefined) {
      return res.status(400).json({
        success: false,
        error: `Курс конвертации ${from} → ${to} не установлен`
      });
    }
    
    const result = parseFloat(amount) * rate;
    
    res.json({
      success: true,
      conversion: {
        from: {
          code: fromCurrency.code,
          name: fromCurrency.name,
          amount: parseFloat(amount)
        },
        to: {
          code: toCurrency.code,
          name: toCurrency.name,
          amount: parseFloat(result.toFixed(4))
        },
        rate: rate,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ✅ 5. АДМИН-ФУНКЦИИ (для управления курсами)

// Добавить новую валюту
app.post('/api/currencies', async (req, res) => {
  try {
    const { code, name, symbol, rates } = req.body;
    
    if (!code || !name) {
      return res.status(400).json({
        success: false,
        error: 'Укажите code и name валюты'
      });
    }
    
    const data = await readCurrencies();
    
    // Проверка на существующую валюту
    if (data.currencies.some(c => c.code === code.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `Валюта ${code} уже существует`
      });
    }
    
    // Создаем новую валюту
    const newCurrency = {
      id: data.currencies.length + 1,
      code: code.toUpperCase(),
      name: name,
      symbol: symbol || '¤',
      rates: rates || {},
      createdAt: new Date().toISOString()
    };
    
    data.currencies.push(newCurrency);
    
    // Обновляем курсы для существующих валют
    data.currencies.forEach(currency => {
      if (currency.code !== newCurrency.code) {
        // Добавляем пустой курс для новой валюты
        currency.rates[newCurrency.code] = 0;
        // Добавляем обратный курс в новую валюту
        newCurrency.rates[currency.code] = 0;
      }
    });
    
    const success = await writeCurrencies(data);
    
    if (success) {
      res.status(201).json({
        success: true,
        message: `Валюта ${code} добавлена`,
        currency: newCurrency
      });
    } else {
      res.status(500).json({ error: 'Ошибка сохранения' });
    }
    
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить курс валюты
app.put('/api/currencies/:code/rates/:target', async (req, res) => {
  try {
    const currencyCode = req.params.code.toUpperCase();
    const targetCode = req.params.target.toUpperCase();
    const { rate } = req.body;
    
    if (rate === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Укажите rate (курс)'
      });
    }
    
    const data = await readCurrencies();
    
    // Находим валюту
    const currencyIndex = data.currencies.findIndex(c => c.code === currencyCode);
    const targetIndex = data.currencies.findIndex(c => c.code === targetCode);
    
    if (currencyIndex === -1 || targetIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Валюта не найдена'
      });
    }
    
    // Обновляем прямой курс
    data.currencies[currencyIndex].rates[targetCode] = parseFloat(rate);
    
    // Автоматически рассчитываем обратный курс
    if (rate !== 0) {
      const reverseRate = 1 / parseFloat(rate);
      data.currencies[targetIndex].rates[currencyCode] = parseFloat(reverseRate.toFixed(6));
    }
    
    const success = await writeCurrencies(data);
    
    if (success) {
      res.json({
        success: true,
        message: `Курс обновлен: 1 ${currencyCode} = ${rate} ${targetCode}`,
        reverse: `1 ${targetCode} = ${(1/rate).toFixed(6)} ${currencyCode}`
      });
    }
    
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить валюту
app.delete('/api/currencies/:code', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const data = await readCurrencies();
    
    const currencyIndex = data.currencies.findIndex(c => c.code === code);
    
    if (currencyIndex === -1) {
      return res.status(404).json({
        success: false,
        error: `Валюта ${code} не найдена`
      });
    }
    
    // Удаляем валюту
    const deletedCurrency = data.currencies.splice(currencyIndex, 1)[0];
    
    // Удаляем упоминания этой валюты из rates других валют
    data.currencies.forEach(currency => {
      delete currency.rates[code];
    });
    
    const success = await writeCurrencies(data);
    
    if (success) {
      res.json({
        success: true,
        message: `Валюта ${code} удалена`,
        deleted: deletedCurrency
      });
    }
    
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ✅ 6. Запуск сервера
async function startServer() {
  await initializeCurrencies();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log(`📡 Локально: http://localhost:${PORT}`);
    console.log(`🏦 API валют готов к работе!`);
    console.log(`📊 Инициализированы валюты: JDC, IO, RUB`);
  });
}

startServer();
