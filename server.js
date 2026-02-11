const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ===========================================
// 🔧 НАСТРОЙКА CORS
// ===========================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true
}));

app.options('*', cors());
app.use(express.json());

// ===========================================
// 🔧 НАСТРОЙКА GOOGLE TABLES
// ===========================================
const SPREADSHEET_ID = 'ваш_id_таблицы_здесь'; // ⚠️ ВСТАВЬТЕ ВАШ ID!
const sheets = google.sheets({ version: 'v4', auth: null });

// ===========================================
// 🔐 НАСТРОЙКИ БЕЗОПАСНОСТИ
// ===========================================
const JWT_SECRET = process.env.JWT_SECRET || 'jad_bank_super_secret_key_2024';
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin_super_key_123';

// ===========================================
// 📥 ФУНКЦИИ ДЛЯ РАБОТЫ С ТАБЛИЦАМИ (ЧТЕНИЕ)
// ===========================================

// 📌 ПОЛУЧИТЬ ВСЕ КУРСЫ
async function getRates() {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'rates!A2:C',
        });
        
        const rates = {};
        (response.data.values || []).forEach(row => {
            if (!rates[row[0]]) rates[row[0]] = {};
            rates[row[0]][row[1]] = parseFloat(row[2]);
        });
        return rates;
    } catch (error) {
        console.error('Ошибка чтения курсов:', error);
        return {
            'JDC': { 'IO': 3, 'RUB': 150 },
            'IO': { 'JDC': 0.3333, 'RUB': 50 },
            'RUB': { 'JDC': 0.0067, 'IO': 0.02 }
        };
    }
}

// 📌 ПОЛУЧИТЬ ПОЛЬЗОВАТЕЛЯ ПО EMAIL
async function getUserByEmail(email) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'users!A:H',
        });
        
        const rows = response.data.values || [];
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][1] === email) {
                return {
                    id: rows[i][0],
                    email: rows[i][1],
                    password: rows[i][2],
                    full_name: rows[i][3],
                    phone: rows[i][4],
                    registered_date: rows[i][5],
                    status: rows[i][6]
                };
            }
        }
        return null;
    } catch (error) {
        console.error('Ошибка поиска пользователя:', error);
        return null;
    }
}

// 📌 ПОЛУЧИТЬ СЧЕТА ПОЛЬЗОВАТЕЛЯ
async function getUserAccounts(userId) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'accounts!A:K',
        });
        
        const accounts = [];
        const rows = response.data.values || [];
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][1] === userId && rows[i][10] === 'active') {
                accounts.push({
                    id: rows[i][0],
                    user_id: rows[i][1],
                    account_number: rows[i][2],
                    currency: rows[i][3],
                    balance: parseFloat(rows[i][4]),
                    account_name: rows[i][5],
                    created_date: rows[i][6],
                    status: rows[i][10]
                });
            }
        }
        return accounts;
    } catch (error) {
        console.error('Ошибка получения счетов:', error);
        return [];
    }
}

// 📌 ПОЛУЧИТЬ СЧЕТ ПО НОМЕРУ
async function getAccountByNumber(accountNumber) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'accounts!A:K',
        });
        
        const rows = response.data.values || [];
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][2] === accountNumber) {
                return {
                    id: rows[i][0],
                    user_id: rows[i][1],
                    account_number: rows[i][2],
                    currency: rows[i][3],
                    balance: parseFloat(rows[i][4]),
                    account_name: rows[i][5],
                    created_date: rows[i][6],
                    status: rows[i][10]
                };
            }
        }
        return null;
    } catch (error) {
        console.error('Ошибка поиска счета:', error);
        return null;
    }
}

// 📌 ПОЛУЧИТЬ ВСЕ АКЦИИ
async function getStocks() {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'stocks!A:I',
        });
        
        const stocks = [];
        const rows = response.data.values || [];
        for (let i = 1; i < rows.length; i++) {
            stocks.push({
                id: rows[i][0],
                symbol: rows[i][1],
                company_name: rows[i][2],
                price_jdc: parseFloat(rows[i][3]),
                price_io: parseFloat(rows[i][4]),
                price_rub: parseFloat(rows[i][5]),
                change_24h: rows[i][6],
                volume: rows[i][7],
                last_updated: rows[i][8]
            });
        }
        return stocks;
    } catch (error) {
        console.error('Ошибка получения акций:', error);
        return [];
    }
}

// 📌 ПОЛУЧИТЬ ПОРТФЕЛЬ ПОЛЬЗОВАТЕЛЯ
async function getUserPortfolio(userId) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'portfolios!A:G',
        });
        
        const portfolio = [];
        const rows = response.data.values || [];
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][1] === userId) {
                portfolio.push({
                    id: rows[i][0],
                    user_id: rows[i][1],
                    stock_symbol: rows[i][2],
                    quantity: parseInt(rows[i][3]),
                    purchase_price: parseFloat(rows[i][4]),
                    purchase_date: rows[i][5],
                    account_number: rows[i][6]
                });
            }
        }
        return portfolio;
    } catch (error) {
        console.error('Ошибка получения портфеля:', error);
        return [];
    }
}

// ===========================================
// 📤 ФУНКЦИИ ДЛЯ ЗАПИСИ В ТАБЛИЦЫ
// ===========================================

// 📌 СОЗДАТЬ НОВОГО ПОЛЬЗОВАТЕЛЯ
async function createUser(email, password, fullName, phone) {
    try {
        // Получаем последний ID
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'users!A:A',
        });
        
        const rows = response.data.values || [];
        const newId = rows.length.toString();
        
        // Хэшируем пароль
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        // Добавляем пользователя
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'users!A:G',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[
                    newId,
                    email,
                    passwordHash,
                    fullName,
                    phone,
                    new Date().toISOString().split('T')[0],
                    'active'
                ]]
            }
        });
        
        return { id: newId, email, full_name: fullName };
    } catch (error) {
        console.error('Ошибка создания пользователя:', error);
        throw error;
    }
}

// 📌 СОЗДАТЬ СЧЕТ ДЛЯ ПОЛЬЗОВАТЕЛЯ
async function createAccount(userId, currency, accountName) {
    try {
        // Получаем последний ID
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'accounts!A:A',
        });
        
        const rows = response.data.values || [];
        const newId = rows.length.toString();
        
        // Генерируем номер счета
        const accountNumber = `ACC${Date.now()}${Math.floor(Math.random() * 1000)}`;
        
        // Начальный баланс для новых счетов
        let initialBalance = 0;
        if (currency === 'JDC') initialBalance = 1000;
        if (currency === 'IO') initialBalance = 3000;
        if (currency === 'RUB') initialBalance = 150000;
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'accounts!A:K',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[
                    newId,
                    userId,
                    accountNumber,
                    currency,
                    initialBalance,
                    accountName || `${currency} счет`,
                    new Date().toISOString().split('T')[0],
                    '', '', '', 'active'
                ]]
            }
        });
        
        return {
            id: newId,
            account_number: accountNumber,
            currency,
            balance: initialBalance,
            account_name: accountName || `${currency} счет`
        };
    } catch (error) {
        console.error('Ошибка создания счета:', error);
        throw error;
    }
}

// 📌 ЗАПИСАТЬ ТРАНЗАКЦИЮ
async function createTransaction(fromAccount, toAccount, amount, currency, type, description) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'transactions!A:A',
        });
        
        const rows = response.data.values || [];
        const newId = rows.length.toString();
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'transactions!A:J',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[
                    newId,
                    new Date().toISOString(),
                    fromAccount,
                    toAccount,
                    amount,
                    currency,
                    type,
                    'completed',
                    description,
                    new Date().toISOString()
                ]]
            }
        });
        
        return { id: newId, success: true };
    } catch (error) {
        console.error('Ошибка записи транзакции:', error);
        throw error;
    }
}

// 📌 ОБНОВИТЬ БАЛАНС СЧЕТА
async function updateAccountBalance(accountNumber, newBalance) {
    try {
        // Находим строку с нужным счетом
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'accounts!A:K',
        });
        
        const rows = response.data.values || [];
        let rowIndex = -1;
        
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][2] === accountNumber) {
                rowIndex = i + 1; // +1 потому что Sheets начинается с 1
                break;
            }
        }
        
        if (rowIndex === -1) throw new Error('Счет не найден');
        
        // Обновляем баланс
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `accounts!E${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[newBalance]]
            }
        });
        
        return true;
    } catch (error) {
        console.error('Ошибка обновления баланса:', error);
        throw error;
    }
}

// 📌 СОЗДАТЬ КРЕДИТ
async function createLoan(userId, accountNumber, amount, currency, termMonths) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'loans!A:A',
        });
        
        const rows = response.data.values || [];
        const newId = rows.length.toString();
        
        const interestRate = 12.5; // 12.5% годовых
        const today = new Date();
        const nextPayment = new Date(today.setMonth(today.getMonth() + 1));
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'loans!A:K',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[
                    newId,
                    userId,
                    accountNumber,
                    amount,
                    currency,
                    interestRate,
                    termMonths,
                    amount, // remaining
                    new Date().toISOString().split('T')[0],
                    nextPayment.toISOString().split('T')[0],
                    'active'
                ]]
            }
        });
        
        return {
            id: newId,
            amount,
            currency,
            interest_rate: interestRate,
            term_months: termMonths
        };
    } catch (error) {
        console.error('Ошибка создания кредита:', error);
        throw error;
    }
}

// 📌 КУПИТЬ АКЦИИ
async function buyStock(userId, stockSymbol, quantity, price, accountNumber) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'portfolios!A:A',
        });
        
        const rows = response.data.values || [];
        const newId = rows.length.toString();
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'portfolios!A:G',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[
                    newId,
                    userId,
                    stockSymbol,
                    quantity,
                    price,
                    new Date().toISOString().split('T')[0],
                    accountNumber
                ]]
            }
        });
        
        return { id: newId, symbol: stockSymbol, quantity, price };
    } catch (error) {
        console.error('Ошибка покупки акций:', error);
        throw error;
    }
}

// ===========================================
// 🔐 Middleware АУТЕНТИФИКАЦИИ
// ===========================================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Неверный токен' });
        req.user = user;
        next();
    });
}

// ===========================================
// 👤 РЕГИСТРАЦИЯ И АВТОРИЗАЦИЯ
// ===========================================

// ✅ РЕГИСТРАЦИЯ НОВОГО ПОЛЬЗОВАТЕЛЯ
app.post('/api/auth/register', async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        const { email, password, full_name, phone } = req.body;
        
        if (!email || !password || !full_name) {
            return res.status(400).json({ error: 'Заполните обязательные поля' });
        }
        
        // Проверяем, существует ли пользователь
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        
        // Создаем пользователя
        const newUser = await createUser(email, password, full_name, phone);
        
        // Создаем счета в трех валютах
        const accounts = await Promise.all([
            createAccount(newUser.id, 'JDC', 'Основной Жад'),
            createAccount(newUser.id, 'IO', 'IO счет'),
            createAccount(newUser.id, 'RUB', 'Рублевый счет')
        ]);
        
        // Генерируем токен
        const token = jwt.sign(
            { id: newUser.id, email: newUser.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
            success: true,
            message: 'Регистрация успешна!',
            user: {
                id: newUser.id,
                email: newUser.email,
                full_name: newUser.full_name
            },
            accounts,
            token
        });
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ✅ ВХОД В СИСТЕМУ
app.post('/api/auth/login', async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        const { email, password } = req.body;
        
        const user = await getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }
        
        const accounts = await getUserAccounts(user.id);
        
        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                phone: user.phone
            },
            accounts,
            token
        });
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===========================================
// 💰 БАНКОВСКИЕ ОПЕРАЦИИ
// ===========================================

// ✅ ПОЛУЧИТЬ ВСЕ СЧЕТА ПОЛЬЗОВАТЕЛЯ
app.get('/api/accounts', authenticateToken, async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        const accounts = await getUserAccounts(req.user.id);
        const rates = await getRates();
        
        // Считаем общий баланс в JDC
        let totalBalanceJDC = 0;
        accounts.forEach(acc => {
            if (acc.currency === 'JDC') totalBalanceJDC += acc.balance;
            else if (acc.currency === 'IO') totalBalanceJDC += acc.balance / rates['IO']['JDC'];
            else if (acc.currency === 'RUB') totalBalanceJDC += acc.balance / rates['RUB']['JDC'];
        });
        
        res.json({
            success: true,
            accounts,
            total_balance_jdc: parseFloat(totalBalanceJDC.toFixed(2))
        });
        
    } catch (error) {
        console.error('Ошибка получения счетов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ✅ ПЕРЕВОД МЕЖДУ СЧЕТАМИ
app.post('/api/transfer', authenticateToken, async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        const { from_account, to_account, amount, description } = req.body;
        
        if (!from_account || !to_account || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Неверные параметры перевода' });
        }
        
        // Получаем счета
        const fromAcc = await getAccountByNumber(from_account);
        const toAcc = await getAccountByNumber(to_account);
        
        if (!fromAcc || !toAcc) {
            return res.status(404).json({ error: 'Счет не найден' });
        }
        
        // Проверяем, что счет принадлежит пользователю
        if (fromAcc.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Нет доступа к счету' });
        }
        
        // Проверяем баланс
        if (fromAcc.balance < amount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }
        
        let transferAmount = parseFloat(amount);
        let convertedAmount = transferAmount;
        
        // Если валюты разные - конвертируем
        if (fromAcc.currency !== toAcc.currency) {
            const rates = await getRates();
            const rate = rates[fromAcc.currency][toAcc.currency];
            
            if (!rate) {
                return res.status(400).json({ error: 'Курс конвертации не найден' });
            }
            
            convertedAmount = transferAmount * rate;
        }
        
        // Обновляем балансы
        await updateAccountBalance(from_account, fromAcc.balance - transferAmount);
        await updateAccountBalance(to_account, toAcc.balance + convertedAmount);
        
        // Записываем транзакцию
        await createTransaction(
            from_account,
            to_account,
            transferAmount,
            fromAcc.currency,
            'transfer',
            description || 'Перевод между счетами'
        );
        
        res.json({
            success: true,
            message: 'Перевод выполнен успешно',
            amount: transferAmount,
            from_currency: fromAcc.currency,
            to_amount: convertedAmount,
            to_currency: toAcc.currency
        });
        
    } catch (error) {
        console.error('Ошибка перевода:', error);
        res.status(500).json({ error: 'Ошибка выполнения перевода' });
    }
});

// ✅ КОНВЕРТАЦИЯ ВАЛЮТ (ОБМЕН)
app.post('/api/exchange', authenticateToken, async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        const { from_account, to_currency, amount } = req.body;
        
        // Получаем счет списания
        const fromAcc = await getAccountByNumber(from_account);
        
        if (!fromAcc || fromAcc.user_id !== req.user.id) {
            return res.status(404).json({ error: 'Счет не найден' });
        }
        
        if (fromAcc.balance < amount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }
        
        // Получаем курс
        const rates = await getRates();
        const rate = rates[fromAcc.currency][to_currency];
        
        if (!rate) {
            return res.status(400).json({ error: 'Курс не найден' });
        }
        
        const convertedAmount = amount * rate;
        
        // Ищем или создаем счет в целевой валюте
        let toAccount = null;
        const userAccounts = await getUserAccounts(req.user.id);
        
        for (const acc of userAccounts) {
            if (acc.currency === to_currency) {
                toAccount = acc;
                break;
            }
        }
        
        if (!toAccount) {
            // Создаем новый счет
            toAccount = await createAccount(req.user.id, to_currency, `${to_currency} счет`);
        }
        
        // Обновляем балансы
        await updateAccountBalance(from_account, fromAcc.balance - amount);
        await updateAccountBalance(toAccount.account_number, toAccount.balance + convertedAmount);
        
        // Записываем транзакцию
        await createTransaction(
            from_account,
            toAccount.account_number,
            amount,
            fromAcc.currency,
            'exchange',
            `Обмен ${fromAcc.currency} → ${to_currency}`
        );
        
        res.json({
            success: true,
            message: 'Обмен выполнен успешно',
            from_amount: amount,
            from_currency: fromAcc.currency,
            to_amount: convertedAmount,
            to_currency: to_currency,
            rate: rate
        });
        
    } catch (error) {
        console.error('Ошибка обмена:', error);
        res.status(500).json({ error: 'Ошибка обмена валют' });
    }
});

// ✅ ПОЛУЧИТЬ ИСТОРИЮ ТРАНЗАКЦИЙ
app.get('/api/transactions', authenticateToken, async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        const userAccounts = await getUserAccounts(req.user.id);
        const accountNumbers = userAccounts.map(acc => acc.account_number);
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'transactions!A:J',
        });
        
        const transactions = [];
        const rows = response.data.values || [];
        
        for (let i = 1; i < rows.length; i++) {
            const trans = {
                id: rows[i][0],
                date: rows[i][1],
                from_account: rows[i][2],
                to_account: rows[i][3],
                amount: parseFloat(rows[i][4]),
                currency: rows[i][5],
                type: rows[i][6],
                status: rows[i][7],
                description: rows[i][8],
                completed_at: rows[i][9]
            };
            
            // Показываем только транзакции пользователя
            if (accountNumbers.includes(trans.from_account) || 
                accountNumbers.includes(trans.to_account)) {
                transactions.push(trans);
            }
        }
        
        res.json({
            success: true,
            transactions: transactions.reverse().slice(0, 50) // Последние 50
        });
        
    } catch (error) {
        console.error('Ошибка получения транзакций:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===========================================
// 💳 КРЕДИТЫ
// ===========================================

// ✅ ОФОРМИТЬ КРЕДИТ
app.post('/api/loans', authenticateToken, async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        const { account_number, amount, currency, term_months } = req.body;
        
        // Проверяем счет
        const account = await getAccountByNumber(account_number);
        if (!account || account.user_id !== req.user.id) {
            return res.status(404).json({ error: 'Счет не найден' });
        }
        
        if (account.currency !== currency) {
            return res.status(400).json({ error: 'Валюта счета не совпадает' });
        }
        
        // Создаем кредит
        const loan = await createLoan(
            req.user.id,
            account_number,
            amount,
            currency,
            term_months
        );
        
        // Зачисляем деньги на счет
        await updateAccountBalance(account_number, account.balance + parseFloat(amount));
        
        // Записываем транзакцию
        await createTransaction(
            'BANK',
            account_number,
            amount,
            currency,
            'loan',
            `Кредит на ${term_months} месяцев`
        );
        
        res.status(201).json({
            success: true,
            message: 'Кредит одобрен!',
            loan,
            new_balance: account.balance + parseFloat(amount)
        });
        
    } catch (error) {
        console.error('Ошибка оформления кредита:', error);
        res.status(500).json({ error: 'Ошибка оформления кредита' });
    }
});

// ✅ ПОЛУЧИТЬ КРЕДИТЫ ПОЛЬЗОВАТЕЛЯ
app.get('/api/loans', authenticateToken, async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'loans!A:K',
        });
        
        const loans = [];
        const rows = response.data.values || [];
        
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][1] === req.user.id && rows[i][10] === 'active') {
                loans.push({
                    id: rows[i][0],
                    account_number: rows[i][2],
                    amount: parseFloat(rows[i][3]),
                    currency: rows[i][4],
                    interest_rate: parseFloat(rows[i][5]),
                    term_months: parseInt(rows[i][6]),
                    remaining: parseFloat(rows[i][7]),
                    issued_date: rows[i][8],
                    next_payment: rows[i][9],
                    status: rows[i][10]
                });
            }
        }
        
        res.json({
            success: true,
            loans
        });
        
    } catch (error) {
        console.error('Ошибка получения кредитов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===========================================
// 📈 ИНВЕСТИЦИИ (АКЦИИ)
// ===========================================

// ✅ ПОЛУЧИТЬ ВСЕ ДОСТУПНЫЕ АКЦИИ
app.get('/api/stocks', async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        const stocks = await getStocks();
        res.json({
            success: true,
            stocks
        });
    } catch (error) {
        console.error('Ошибка получения акций:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ✅ КУПИТЬ АКЦИИ
app.post('/api/stocks/buy', authenticateToken, async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        const { stock_symbol, quantity, account_number } = req.body;
        
        // Получаем счет
        const account = await getAccountByNumber(account_number);
        if (!account || account.user_id !== req.user.id) {
            return res.status(404).json({ error: 'Счет не найден' });
        }
        
        // Получаем акцию
        const stocks = await getStocks();
        const stock = stocks.find(s => s.symbol === stock_symbol);
        
        if (!stock) {
            return res.status(404).json({ error: 'Акция не найдена' });
        }
        
        // Определяем цену в валюте счета
        let price;
        if (account.currency === 'JDC') price = stock.price_jdc;
        else if (account.currency === 'IO') price = stock.price_io;
        else if (account.currency === 'RUB') price = stock.price_rub;
        else {
            return res.status(400).json({ error: 'Неподдерживаемая валюта' });
        }
        
        const totalCost = price * quantity;
        
        // Проверяем баланс
        if (account.balance < totalCost) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }
        
        // Списываем деньги
        await updateAccountBalance(account_number, account.balance - totalCost);
        
        // Покупаем акции
        const purchase = await buyStock(
            req.user.id,
            stock_symbol,
            quantity,
            price,
            account_number
        );
        
        // Записываем транзакцию
        await createTransaction(
            account_number,
            'STOCK_EXCHANGE',
            totalCost,
            account.currency,
            'stock_purchase',
            `Покупка ${quantity} ${stock_symbol} по цене ${price}`
        );
        
        res.json({
            success: true,
            message: `Куплено ${quantity} акций ${stock_symbol}`,
            stock: stock.company_name,
            quantity,
            price,
            total: totalCost,
            new_balance: account.balance - totalCost
        });
        
    } catch (error) {
        console.error('Ошибка покупки акций:', error);
        res.status(500).json({ error: 'Ошибка покупки акций' });
    }
});

// ✅ ПОЛУЧИТЬ ПОРТФЕЛЬ ПОЛЬЗОВАТЕЛЯ
app.get('/api/portfolio', authenticateToken, async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        const portfolio = await getUserPortfolio(req.user.id);
        const stocks = await getStocks();
        
        // Рассчитываем текущую стоимость
        let totalValue = 0;
        const portfolioWithPrices = portfolio.map(item => {
            const stock = stocks.find(s => s.symbol === item.stock_symbol);
            const currentPrice = stock?.price_jdc || 0;
            const profit = (currentPrice - item.purchase_price) * item.quantity;
            
            totalValue += currentPrice * item.quantity;
            
            return {
                ...item,
                company_name: stock?.company_name,
                current_price: currentPrice,
                profit: parseFloat(profit.toFixed(2)),
                profit_percent: parseFloat(((profit / (item.purchase_price * item.quantity)) * 100).toFixed(2))
            };
        });
        
        res.json({
            success: true,
            portfolio: portfolioWithPrices,
            total_value: totalValue,
            total_invested: portfolio.reduce((sum, item) => 
                sum + (item.purchase_price * item.quantity), 0)
        });
        
    } catch (error) {
        console.error('Ошибка получения портфеля:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===========================================
// 💳 ОПЛАТА СЧЕТОВ
// ===========================================

// ✅ ПОЛУЧИТЬ СЧЕТА К ОПЛАТЕ
app.get('/api/bills', authenticateToken, async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'bills!A:I',
        });
        
        const bills = [];
        const rows = response.data.values || [];
        
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][1] === req.user.id && rows[i][7] === 'pending') {
                bills.push({
                    id: rows[i][0],
                    bill_number: rows[i][2],
                    amount: parseFloat(rows[i][3]),
                    currency: rows[i][4],
                    due_date: rows[i][5],
                    provider: rows[i][6],
                    status: rows[i][7],
                    account_number: rows[i][8]
                });
            }
        }
        
        res.json({
            success: true,
            bills
        });
        
    } catch (error) {
        console.error('Ошибка получения счетов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ✅ ОПЛАТИТЬ СЧЕТ
app.post('/api/bills/pay', authenticateToken, async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        const { bill_id, from_account } = req.body;
        
        // Получаем счет к оплате
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'bills!A:I',
        });
        
        const rows = response.data.values || [];
        let bill = null;
        let rowIndex = -1;
        
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === bill_id) {
                bill = {
                    id: rows[i][0],
                    user_id: rows[i][1],
                    bill_number: rows[i][2],
                    amount: parseFloat(rows[i][3]),
                    currency: rows[i][4],
                    due_date: rows[i][5],
                    provider: rows[i][6],
                    status: rows[i][7],
                    account_number: rows[i][8]
                };
                rowIndex = i + 1;
                break;
            }
        }
        
        if (!bill) {
            return res.status(404).json({ error: 'Счет не найден' });
        }
        
        if (bill.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Нет доступа' });
        }
        
        // Получаем счет для оплаты
        const account = await getAccountByNumber(from_account);
        if (!account || account.user_id !== req.user.id) {
            return res.status(404).json({ error: 'Счет не найден' });
        }
        
        // Проверяем валюту
        if (account.currency !== bill.currency) {
            return res.status(400).json({ error: 'Валюта счета не совпадает с валютой счета' });
        }
        
        // Проверяем баланс
        if (account.balance < bill.amount) {
            return res.status(400).json({ error: 'Недостаточно средств' });
        }
        
        // Списываем деньги
        await updateAccountBalance(from_account, account.balance - bill.amount);
        
        // Обновляем статус счета
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `bills!H${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['paid']]
            }
        });
        
        // Записываем транзакцию
        await createTransaction(
            from_account,
            bill.provider,
            bill.amount,
            bill.currency,
            'bill_payment',
            `Оплата счета ${bill.bill_number}`
        );
        
        res.json({
            success: true,
            message: `Счет ${bill.bill_number} оплачен`,
            amount: bill.amount,
            provider: bill.provider
        });
        
    } catch (error) {
        console.error('Ошибка оплаты счета:', error);
        res.status(500).json({ error: 'Ошибка оплаты счета' });
    }
});

// ===========================================
// 📊 КУРСЫ ВАЛЮТ (ПУБЛИЧНОЕ)
// ===========================================

// ✅ ПОЛУЧИТЬ ТЕКУЩИЕ КУРСЫ
app.get('/api/rates', async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    
    try {
        const rates = await getRates();
        
        res.json({
            success: true,
            rates,
            last_updated: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Ошибка получения курсов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ===========================================
// 🚀 ЗАПУСК СЕРВЕРА
// ===========================================

app.listen(PORT, '0.0.0.0', () => {
    console.log('=================================');
    console.log('✅ БАНК ЖАД - ПОЛНАЯ ВЕРСИЯ');
    console.log('=================================');
    console.log(`📍 Порт: ${PORT}`);
    console.log(`📊 Google Таблица ID: ${SPREADSHEET_ID}`);
    console.log(`👤 Регистрация: POST /api/auth/register`);
    console.log(`💰 Переводы: POST /api/transfer`);
    console.log(`💱 Обмен: POST /api/exchange`);
    console.log(`💳 Кредиты: POST /api/loans`);
    console.log(`📈 Акции: GET /api/stocks`);
    console.log(`📋 Портфель: GET /api/portfolio`);
    console.log(`🧾 Оплата счетов: POST /api/bills/pay`);
    console.log('=================================');
});
