require('dotenv').config();
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

// Configurações básicas
const app = express();
const PORT = 3000;
const saltRounds = 10;

// Configuração do Nodemailer (Outlook)
const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false, // true para porta 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false // Apenas para desenvolvimento
  }
});

// Conexão com o banco de dados
const db = new sqlite3.Database('techacademy.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err.message);
    process.exit(1);
  }
  console.log('Conectado ao banco de dados SQLite.');
});

// Criar tabelas necessárias
db.serialize(() => {
  // Tabela de usuários
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    )
  `, (err) => {
    if (err) {
      console.error('Erro ao criar tabela usuarios:', err.message);
      return;
    }
    
    // Inserir usuário admin padrão
    const defaultPassword = '12345';
    bcrypt.hash(defaultPassword, saltRounds, (err, hash) => {
      if (err) {
        console.error('Erro ao criptografar senha:', err.message);
        return;
      }
      db.run(`INSERT OR IGNORE INTO usuarios (nome, username, password) VALUES (?, ?, ?)`, 
        ['Administrador', 'admin', hash]);
    });
  });

  // Tabela de contatos
  db.run(`
    CREATE TABLE IF NOT EXISTS contatos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL,
      telefone TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      data_envio DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../front-end')));

// Rotas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../front-end/index.html'));
});

// Rota de login
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM usuarios WHERE username = ?', [username], (err, row) => {
    if (err) {
      console.error('Erro ao consultar usuário:', err.message);
      return res.status(500).send('Erro no servidor');
    }
    
    if (row) {
      bcrypt.compare(password, row.password, (err, result) => {
        if (err) {
          console.error('Erro ao comparar senhas:', err.message);
          return res.status(500).send('Erro no servidor');
        }
        if (result) {
          res.redirect('/painelA.html');
        } else {
          res.status(401).send('Usuário ou senha incorretos!');
        }
      });
    } else {
      res.status(401).send('Usuário ou senha incorretos!');
    }
  });
});

// Rota de cadastro
app.post('/cadastro', (req, res) => {
  const { nome, username, password, confirm_password } = req.body;

  if (!nome || !username || !password || !confirm_password) {
    return res.status(400).send('Preencha todos os campos.');
  }

  if (password !== confirm_password) {
    return res.status(400).send('As senhas não coincidem.');
  }

  bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
      console.error('Erro ao criptografar senha:', err.message);
      return res.status(500).send('Erro no servidor');
    }

    db.run(
      'INSERT INTO usuarios (nome, username, password) VALUES (?, ?, ?)',
      [nome, username, hash],
      function(err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).send('Usuário já existe!');
          }
          console.error('Erro ao cadastrar usuário:', err.message);
          return res.status(500).send('Erro no servidor');
        }
        res.redirect('/login.html?success=1');
      }
    );
  });
});

// Rota para enviar email de contato
app.post('/enviar-email', async (req, res) => {
  const { nome, email, telefone, mensagem } = req.body;

  // Validação simples
  if (!nome || !email || !mensagem) {
    return res.status(400).json({ 
      success: false,
      message: 'Preencha todos os campos obrigatórios.' 
    });
  }

  try {
    // Salvar no banco de dados
    db.run(
      'INSERT INTO contatos (nome, email, telefone, mensagem) VALUES (?, ?, ?, ?)',
      [nome, email, telefone, mensagem]
    );

    // Configurar email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Pode alterar para outro email
      subject: `Nova mensagem de ${nome}`,
      html: `
        <h2>Novo contato via formulário</h2>
        <p><strong>Nome:</strong> ${nome}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Telefone:</strong> ${telefone || 'Não informado'}</p>
        <p><strong>Mensagem:</strong></p>
        <p>${mensagem}</p>
      `
    };

    // Enviar email
    await transporter.sendMail(mailOptions);
    res.json({ 
      success: true,
      message: 'Mensagem enviada com sucesso!' 
    });

  } catch (error) {
    console.error('Erro ao enviar email:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro ao enviar mensagem. Tente novamente mais tarde.' 
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Email configurado: ${process.env.EMAIL_USER}`);
});

// Tratar erros do banco de dados
db.on('error', (err) => {
  console.error('Erro no banco de dados:', err.message);
});