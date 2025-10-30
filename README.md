# Controle Financeiro Pessoal

## Sobre o Projeto

Este é um aplicativo web de controle financeiro pessoal, desenvolvido como uma ferramenta intuitiva e fácil de usar para ajudar os usuários a gerenciar suas finanças de forma eficaz. Com ele, é possível adicionar e categorizar receitas e despesas, visualizar resumos detalhados e acompanhar a evolução do saldo ao longo do tempo. A aplicação foi criada para ser personalizável, permitindo que os usuários adaptem categorias, meios de pagamento e muito mais para atender às suas necessidades específicas.

## Principais Funcionalidades

- **Gestão de Entradas e Despesas:** Adicione, edite e exclua transações financeiras com facilidade. É possível também propagar transações fixas para os meses seguintes, automatizando o controle de contas recorrentes.
- **Resumo Mensal:** Tenha uma visão clara da sua saúde financeira a cada mês. A aplicação oferece gráficos de distribuição de despesas que ajudam a identificar para onde o seu dinheiro está a ir.
- **Resumo Anual:** Acompanhe o seu progresso financeiro ao longo do ano. Visualize a evolução do seu saldo com gráficos interativos e exporte os dados para um arquivo CSV para uma análise mais aprofundada.
- **Projeção Diária:** Planeie o seu mês com mais segurança. A projeção de saldo diário mostra como o seu saldo irá evoluir com base nas transações que já foram registadas.
- **Configurações Personalizáveis:** A aplicação é altamente configurável. Pode personalizar categorias de despesas, meios de pagamento, tipos de despesa e nomes de cartões de crédito para que se ajustem perfeitamente à sua vida financeira.

## Tecnologias Utilizadas

- **React:** Uma biblioteca JavaScript para a construção de interfaces de usuário dinâmicas e reativas.
- **Firebase:** Uma plataforma de desenvolvimento de aplicações que oferece um conjunto de ferramentas para o backend, incluindo:
  - **Firestore:** Uma base de dados NoSQL para armazenar os dados das transações.
  - **Authentication:** Para gerir a autenticação de usuários de forma segura.
- **Recharts:** Uma biblioteca de gráficos para a criação de visualizações de dados interativas e informativas.
- **Tailwind CSS:** Um framework CSS que permite a criação de designs modernos e responsivos.

## Estrutura do Projeto

A estrutura do projeto é simples e organizada, com os principais arquivos localizados na pasta `src`:

```
/
|-- public/
|   |-- index.html
|-- src/
|   |-- App.js
|   |-- index.css
|   |-- index.js
|-- package.json
|-- README.md
```

- **`src/App.js`:** O coração da aplicação, onde se encontra a maior parte da lógica dos componentes e a gestão do estado.
- **`src/index.js`:** O ponto de entrada da aplicação React.
- **`public/index.html`:** O arquivo HTML principal que serve como base para a aplicação.

## Pré-requisitos

Para executar este projeto, vai precisar de:

- **Node.js:** Versão 14 ou superior.
- **npm:** O gestor de pacotes do Node.js.

## Instalação e Configuração

Siga estes passos para configurar e executar o projeto localmente:

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/seu-usuario/seu-repositorio.git
   cd seu-repositorio
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

## Como Executar a Aplicação

Para iniciar a aplicação em modo de desenvolvimento, utilize o seguinte comando:

```bash
npm start
```

Este comando irá iniciar o servidor de desenvolvimento e abrir a aplicação no seu navegador, normalmente em `http://localhost:3000`.

## Configuração do Firebase

A aplicação utiliza o Firebase para o backend, por isso, é necessário configurar as suas credenciais para que tudo funcione corretamente.

1. **Crie um projeto no Firebase:**
   - Aceda ao [console do Firebase](https://console.firebase.google.com/) e crie um novo projeto.

2. **Crie uma aplicação web:**
   - No seu projeto do Firebase, crie uma nova aplicação web e copie as suas credenciais.

3. **Configure as credenciais:**
   - No arquivo `src/App.js`, encontre o objeto `firebaseConfigExternal` e substitua os valores pelas suas credenciais do Firebase:

   ```javascript
   const firebaseConfigExternal = {
     apiKey: "SUA_API_KEY",
     authDomain: "SEU_AUTH_DOMAIN",
     projectId: "SEU_PROJECT_ID",
     storageBucket: "SEU_STORAGE_BUCKET",
     messagingSenderId: "SEU_MESSAGING_SENDER_ID",
     appId: "SEU_APP_ID"
   };
   ```

4. **Ative a autenticação anônima:**
   - No console do Firebase, vá para a seção "Authentication" e ative o método de login anônimo.

5. **Configure as regras de segurança do Firestore:**
   - Vá para a seção "Firestore Database" e configure as seguintes regras de segurança para permitir que os usuários leiam e escrevam os seus próprios dados:

   ```json
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /artifacts/{appId}/users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```
