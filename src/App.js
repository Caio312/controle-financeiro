import React, { useState, useEffect, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs, where } from 'firebase/firestore';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Contexto para o Firebase e dados do usuário
const FirebaseContext = createContext(null);

// Componente CustomModal para substituir alert() e confirm()
const CustomModal = ({ message, onConfirm, onCancel, showCancel = false }) => {
  if (!message) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
        <p className="text-lg font-semibold mb-4 text-gray-800">{message}</p>
        <div className="flex justify-end space-x-3">
          {showCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition duration-200"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-200"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

// Componente de overlay de carregamento
const LoadingOverlay = ({ isLoading }) => {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50">
      <div className="flex flex-col items-center text-white">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
        <p className="mt-4 text-lg">Carregando...</p>
      </div>
    </div>
  );
};

// Componente principal do aplicativo
function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentMonthIndex, setCurrentMonthIndex] = useState(new Date().getMonth()); // 0-11
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [entries, setEntries] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [userConfig, setUserConfig] = useState({
    categories: ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Outros'],
    paymentMethods: ['Dinheiro', 'Cartão de Crédito', 'Débito', 'PIX'],
    expenseTypes: ['Fixo', 'Variável'],
    creditCardNames: ['Cartão A', 'Cartão B'],
  });
  const [globalLoading, setGlobalLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('entradas');

  // Estado para o modal personalizado
  const [modalMessage, setModalMessage] = useState('');
  const [modalOnConfirm, setModalOnConfirm] = useState(() => {});
  const [modalShowCancel, setModalShowCancel] = useState(false);

  // Função para exibir o modal
  const showModal = (message, onConfirmCallback = () => {}, showCancel = false) => {
    setModalMessage(message);
    setModalOnConfirm(() => {
      return () => {
        onConfirmCallback();
        setModalMessage('');
      };
    });
    setModalShowCancel(showCancel);
  };

  // Função para fechar o modal
  const closeModal = () => {
    setModalMessage('');
  };

  // Configuração do Firebase para AMBOS os ambientes (Gemini e Externo)
  // Para uso externo (local ou GitHub Pages), preencha com suas credenciais.
  const firebaseConfigExternal = {
    apiKey: "AIzaSyDGGKkNtDuQopnZ_G9CfwYtv0C_P-Hn8v4", // SEU apiKey REAL
    authDomain: "caio-fcfe1.firebaseapp.com", // SEU authDomain REAL
    projectId: "caio-fcfe1", // SEU projectId REAL
    storageBucket: "caio-fcfe1.firebasestorage.app", // SEU storageBucket REAL
    messagingSenderId: "688858187556", // SEU messagingSenderId REAL
    appId: "1:688858187556:web:a3776f329a52514777d5b1" // SEU appId REAL
  };

  // Determina se estamos no ambiente Gemini verificando a existência de window.__firebase_config
  // Adicionado window para evitar erros de 'not defined' do ESLint
  const isGeminiEnvironment = typeof window !== 'undefined' && typeof window.__firebase_config !== 'undefined';

  // Usa a configuração do Gemini se disponível, caso contrário, usa a configuração externa
  const currentFirebaseConfig = isGeminiEnvironment
    ? JSON.parse(window.__firebase_config)
    : firebaseConfigExternal;

  // O appId agora é derivado da configuração atual, com verificação de window.__app_id
  const appId = isGeminiEnvironment
    ? (typeof window !== 'undefined' && typeof window.__app_id !== 'undefined' ? window.__app_id : currentFirebaseConfig.projectId || 'default-app-id')
    : (currentFirebaseConfig.projectId || 'default-app-id');


  // Inicialização do Firebase e autenticação
  useEffect(() => {
    setGlobalLoading(true); // Inicia o carregamento global

    console.log("App Init: isGeminiEnvironment =", isGeminiEnvironment);
    console.log("App Init: configToUse =", currentFirebaseConfig);
    console.log("App Init: currentAppId =", appId);

    // Basic validation for external environment
    if (!isGeminiEnvironment && (!currentFirebaseConfig.apiKey || !currentFirebaseConfig.projectId || currentFirebaseConfig.apiKey === "YOUR_API_KEY")) {
      console.error("Erro: As configurações do Firebase estão faltando ou incompletas para o ambiente externo.");
      setGlobalLoading(false);
      showModal("Erro de configuração do Firebase: Por favor, insira suas chaves de API válidas no código (App.js). O aplicativo não funcionará sem elas.", () => {}, false);
      return;
    }

    let appInstance;
    let firestoreDbInstance;
    let firebaseAuthInstance;

    try {
      appInstance = initializeApp(currentFirebaseConfig);
      firestoreDbInstance = getFirestore(appInstance);
      firebaseAuthInstance = getAuth(appInstance);

      setDb(firestoreDbInstance);
      setAuth(firebaseAuthInstance);

      console.log("Firebase App, Firestore, Auth initialized successfully.");

      const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (user) => {
        console.log("onAuthStateChanged triggered. User object:", user);
        if (user) {
          setUserId(user.uid);
          console.log("User ID set:", user.uid);
        } else {
          console.log("No user found, attempting sign-in based on environment.");
          // Acessa window.__initial_auth_token com verificação de existência de window
          if (isGeminiEnvironment && typeof window !== 'undefined' && typeof window.__initial_auth_token !== 'undefined') {
            try {
              console.log("Attempting signInWithCustomToken (Gemini environment)");
              await signInWithCustomToken(firebaseAuthInstance, window.__initial_auth_token);
              setUserId(firebaseAuthInstance.currentUser?.uid);
              console.log("signInWithCustomToken successful. User ID:", firebaseAuthInstance.currentUser?.uid);
            } catch (error) {
              console.error("Erro ao autenticar com token do Gemini:", error);
              console.log("Attempting signInAnonymously as fallback (Gemini environment).");
              try {
                await signInAnonymously(firebaseAuthInstance);
                setUserId(firebaseAuthInstance.currentUser?.uid);
                console.log("signInAnonymously (fallback) successful. User ID:", firebaseAuthInstance.currentUser?.uid);
              } catch (anonError) {
                console.error("Erro ao autenticar anonimamente (fallback):", anonError);
                showModal(
                  "Erro de autenticação: Não foi possível autenticar o usuário. Verifique as regras de segurança do seu Firebase ou suas credenciais.",
                  () => {},
                  false
                );
              }
            }
          } else {
            console.log("Attempting signInAnonymously (External/Default environment)");
            try {
              await signInAnonymously(firebaseAuthInstance);
              setUserId(firebaseAuthInstance.currentUser?.uid);
              console.log("signInAnonymously (External/Default) successful. User ID:", firebaseAuthInstance.currentUser?.uid);
            } catch (error) {
              console.error("Erro ao autenticar anonimamente:", error);
              showModal(
                "Erro de autenticação: Não foi possível autenticar o usuário anonimamente. Verifique as regras de segurança do seu Firebase ou suas credenciais.",
                () => {},
                false
              );
            }
          }
        }
        setIsAuthReady(true); // Marca que a autenticação inicial foi processada
        setGlobalLoading(false); // Finaliza o carregamento global após autenticação
        console.log("Authentication process completed. isAuthReady set to true, globalLoading set to false.");
      });

      return () => {
        console.log("Cleaning up auth state listener.");
        unsubscribe();
      };
    } catch (error) {
      console.error("Erro crítico na inicialização do Firebase (try-catch externo):", error);
      setGlobalLoading(false); // Garante que o carregamento seja desativado mesmo em erro crítico
      showModal(
        `Erro crítico na inicialização do aplicativo: ${error.message}. Por favor, verifique o console para mais detalhes.`,
        () => {},
        false
      );
    }
  }, []); // Dependência vazia para rodar uma vez na montagem

  // Carregar configurações do usuário
  useEffect(() => {
    if (isAuthReady && userId && db) {
      console.log("Attempting to load user config for userId:", userId);
      const userConfigRef = doc(db, `artifacts/${appId}/users/${userId}/userConfig`, 'settings');
      const unsubscribe = onSnapshot(userConfigRef, (docSnap) => {
        if (docSnap.exists()) {
          setUserConfig(docSnap.data());
          console.log("User config loaded:", docSnap.data());
        } else {
          console.log("No user config found, saving default config.");
          setDoc(userConfigRef, userConfig, { merge: true }).catch(e => console.error("Error saving default config:", e));
        }
      }, (error) => {
        console.error("Erro ao carregar configurações do usuário:", error);
      });
      return () => unsubscribe();
    } else if (isAuthReady && !userId) {
      console.warn("User config not loaded: Authentication ready but userId is null.");
    }
  }, [isAuthReady, userId, db, appId, userConfig]);

  // Carregar entradas e despesas para o mês ativo
  useEffect(() => {
    if (isAuthReady && userId && db) {
      console.log("Attempting to load entries and expenses for month:", currentMonthIndex + 1, "year:", currentYear);
      const monthStr = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;
      const entriesRef = collection(db, `artifacts/${appId}/users/${userId}/financialData/${monthStr}/entries`);
      const expensesRef = collection(db, `artifacts/${appId}/users/${userId}/financialData/${monthStr}/expenses`);

      const unsubscribeEntries = onSnapshot(entriesRef, (snapshot) => {
        const fetchedEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setEntries(fetchedEntries);
        console.log("Entries loaded:", fetchedEntries.length);
      }, (error) => {
        console.error("Erro ao carregar entradas:", error);
      });

      const unsubscribeExpenses = onSnapshot(expensesRef, (snapshot) => {
        const fetchedExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setExpenses(fetchedExpenses);
        console.log("Expenses loaded:", fetchedExpenses.length);
      }, (error) => {
        console.error("Erro ao carregar despesas:", error);
      });

      return () => {
        unsubscribeEntries();
        unsubscribeExpenses();
        console.log("Cleaning up entries/expenses listeners.");
      };
    } else if (isAuthReady && !userId) {
      console.warn("Entries/Expenses not loaded: Authentication ready but userId is null.");
    }
  }, [isAuthReady, userId, db, currentMonthIndex, currentYear, appId]);

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const handleMonthChange = (event) => {
    setCurrentMonthIndex(parseInt(event.target.value));
  };

  const handleYearChange = (event) => {
    setCurrentYear(parseInt(event.target.value));
  };

  // Renderiza o overlay de carregamento até que a autenticação esteja pronta
  if (!isAuthReady) {
    console.log("Displaying LoadingOverlay: isAuthReady is false.");
    return <LoadingOverlay isLoading={true} />;
  }

  // Se a autenticação estiver pronta mas não houver userId (ex: erro na autenticação anônima),
  // exibe uma mensagem de erro persistente.
  if (!userId) {
    console.log("Displaying Auth Error: isAuthReady is true, but userId is null.");
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-xl font-semibold text-red-500">
          Erro: Não foi possível autenticar o usuário. Verifique suas configurações do Firebase e as regras de segurança.
        </div>
      </div>
    );
  }

  console.log("App is fully loaded and ready. userId:", userId);
  return (
    <FirebaseContext.Provider value={{ db, userId, userConfig, setUserConfig, showModal, setGlobalLoading }}>
      <div className="min-h-screen bg-gray-100 font-inter text-gray-800 flex flex-col">
        <LoadingOverlay isLoading={globalLoading} />
        <CustomModal
          message={modalMessage}
          onConfirm={modalOnConfirm}
          onCancel={closeModal}
          showCancel={modalShowCancel}
        />

        <header className="bg-blue-700 text-white p-2 sm:p-4 shadow-md flex flex-col sm:flex-row sm:justify-between sm:items-center">
          <h1 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-0">Controle Financeiro</h1>
          <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
            <span className="text-xs sm:text-sm">ID do Usuário: {userId}</span>
            <select
              value={currentMonthIndex}
              onChange={handleMonthChange}
              className="bg-blue-600 text-white rounded-md px-2 py-1 text-sm sm:px-3 sm:py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {months.map((month, index) => (
                <option key={month} value={index}>{month}</option>
              ))}
            </select>
            <select
              value={currentYear}
              onChange={handleYearChange}
              className="bg-blue-600 text-white rounded-md px-2 py-1 text-sm sm:px-3 sm:py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <button
              onClick={() => setActiveTab('resumo-anual')}
              className={`px-3 py-1 text-sm rounded-md font-medium transition duration-200
                ${activeTab === 'resumo-anual' ? 'bg-white text-blue-700 shadow' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
            >
              Resumo Anual
            </button>
          </div>
        </header>

        <div className="bg-gray-200 p-2 shadow-inner">
          <div className="flex flex-wrap justify-center gap-1 sm:space-x-2">
            <button
              onClick={() => setActiveTab('entradas')}
              className={`px-3 py-1 text-sm rounded-md font-medium transition duration-200
                ${activeTab === 'entradas' ? 'bg-white text-blue-700 shadow' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'}`}
            >
              Entradas
            </button>
            <button
              onClick={() => setActiveTab('despesas')}
              className={`px-3 py-1 text-sm rounded-md font-medium transition duration-200
                ${activeTab === 'despesas' ? 'bg-white text-blue-700 shadow' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'}`}
            >
              Despesas
            </button>
            <button
              onClick={() => setActiveTab('resumo-mensal')}
              className={`px-3 py-1 text-sm rounded-md font-medium transition duration-200
                ${activeTab === 'resumo-mensal' ? 'bg-white text-blue-700 shadow' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'}`}
            >
              Resumo Mensal
            </button>
            <button
              onClick={() => setActiveTab('projecao-diaria')}
              className={`px-3 py-1 text-sm rounded-md font-medium transition duration-200
                ${activeTab === 'projecao-diaria' ? 'bg-white text-blue-700 shadow' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'}`}
            >
              Projeção Diária
            </button>
            <button
              onClick={() => setActiveTab('configuracoes')}
              className={`px-3 py-1 text-sm rounded-md font-medium transition duration-200
                ${activeTab === 'configuracoes' ? 'bg-white text-blue-700 shadow' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'}`}
            >
              Configurações
            </button>
          </div>
        </div>

        <main className="flex-1 p-4 overflow-y-auto">
          {activeTab === 'entradas' && (
            <EntriesSection
              entries={entries}
              currentMonthIndex={currentMonthIndex}
              currentYear={currentYear}
            />
          )}
          {activeTab === 'despesas' && (
            <ExpensesSection
              expenses={expenses}
              currentMonthIndex={currentMonthIndex}
              currentYear={currentYear}
            />
          )}
          {activeTab === 'resumo-mensal' && (
            <MonthlySummaryChart
              entries={entries}
              expenses={expenses}
              currentMonthIndex={currentMonthIndex}
              currentYear={currentYear}
            />
          )}
          {activeTab === 'resumo-anual' && (
            <AnnualSummary
              currentYear={currentYear}
              activeTab={activeTab}
            />
          )}
          {activeTab === 'projecao-diaria' && (
            <DailyProjection
              entries={entries}
              expenses={expenses}
              currentMonthIndex={currentMonthIndex}
              currentYear={currentYear}
            />
          )}
          {activeTab === 'configuracoes' && (
            <SettingsSection />
          )}
        </main>
      </div>
    </FirebaseContext.Provider>
  );
}

// Componente para a seção de Entradas
const EntriesSection = ({ entries, currentMonthIndex, currentYear }) => {
  const { db, userId, showModal } = useContext(FirebaseContext);
  const [newEntry, setNewEntry] = useState({ date: '', description: '', value: '', type: 'Fixo' });
  const [editingEntry, setEditingEntry] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewEntry({ ...newEntry, [name]: value });
  };

  const addEntry = async () => {
    if (!db || !userId) return;
    if (!newEntry.date || !newEntry.description || !newEntry.value) {
      showModal('Por favor, preencha todos os campos para adicionar uma entrada.');
      return;
    }

    const entryDate = new Date(newEntry.date);
    const targetYear = entryDate.getFullYear();
    const targetMonthIndex = entryDate.getMonth();
    const monthStr = `${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}`;
    const entriesRef = collection(db, `artifacts/${db.app.options.projectId || 'default-app-id'}/users/${userId}/financialData/${monthStr}/entries`);

    try {
      await addDoc(entriesRef, {
        ...newEntry,
        value: parseFloat(newEntry.value),
        date: entryDate.toISOString().split('T')[0],
      });
      setNewEntry({ date: '', description: '', value: '', type: 'Fixo' });
      showModal('Entrada adicionada com sucesso!');
    } catch (e) {
      console.error("Erro ao adicionar entrada: ", e);
      showModal('Erro ao adicionar entrada.');
    }
  };

  const startEditEntry = (entry) => {
    setEditingEntry({ ...entry });
    setNewEntry({ ...entry });
  };

  const updateEntry = async () => {
    if (!db || !userId || !editingEntry) return;
    if (!newEntry.date || !newEntry.description || !newEntry.value) {
      showModal('Por favor, preencha todos os campos para atualizar a entrada.');
      return;
    }

    const entryDate = new Date(newEntry.date);
    const targetYear = entryDate.getFullYear();
    const targetMonthIndex = entryDate.getMonth();
    const monthStr = `${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}`;
    const entryDocRef = doc(db, `artifacts/${db.app.options.projectId || 'default-app-id'}/users/${userId}/financialData/${monthStr}/entries`, editingEntry.id);

    try {
      await updateDoc(entryDocRef, {
        ...newEntry,
        value: parseFloat(newEntry.value),
        date: entryDate.toISOString().split('T')[0],
      });
      setEditingEntry(null);
      setNewEntry({ date: '', description: '', value: '', type: 'Fixo' });
      showModal('Entrada atualizada com sucesso!');
    } catch (e) {
      console.error("Erro ao atualizar entrada: ", e);
      showModal('Erro ao atualizar entrada.');
    }
  };

  const deleteEntry = (entryId) => {
    showModal('Tem certeza que deseja excluir esta entrada?', async () => {
      if (!db || !userId) return;
      const monthStr = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;
      const entryDocRef = doc(db, `artifacts/${db.app.options.projectId || 'default-app-id'}/users/${userId}/financialData/${monthStr}/entries`, entryId);
      try {
        await deleteDoc(entryDocRef);
        showModal('Entrada excluída com sucesso!');
      } catch (e) {
        console.error("Erro ao excluir entrada: ", e);
        showModal('Erro ao excluir entrada.');
      }
    }, true);
  };

  const propagateSingleFixedEntry = async (entryToPropagate) => {
    showModal(`Deseja propagar a entrada fixa "${entryToPropagate.description}" para os meses futuros do ano atual?`, async () => {
      if (!db || !userId) return;

      if (entryToPropagate.type !== 'Fixo') {
        showModal('Apenas entradas do tipo "Fixo" podem ser propagadas individualmente.');
        return;
      }

      for (let i = currentMonthIndex + 1; i < 12; i++) {
        const futureMonthStr = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
        const futureEntriesRef = collection(db, `artifacts/${db.app.options.projectId || 'default-app-id'}/users/${userId}/financialData/${futureMonthStr}/entries`);

        const q = query(futureEntriesRef,
          where("description", "==", entryToPropagate.description),
          where("value", "==", entryToPropagate.value),
          where("type", "==", entryToPropagate.type)
        );
        const existingDocs = await getDocs(q);

        if (existingDocs.empty) {
          await addDoc(futureEntriesRef, {
            date: entryToPropagate.date,
            description: entryToPropagate.description,
            value: entryToPropagate.value,
            type: entryToPropagate.type,
          });
        }
      }
      showModal('Entrada fixa propagada com sucesso!');
    }, true);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 text-blue-700">Gestão de Entradas</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <input
          type="date"
          name="date"
          value={newEntry.date}
          onChange={handleInputChange}
          className="p-2 text-sm sm:p-3 sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          name="description"
          placeholder="Descrição"
          value={newEntry.description}
          onChange={handleInputChange}
          className="p-2 text-sm sm:p-3 sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="number"
          name="value"
          placeholder="Valor"
          value={newEntry.value}
          onChange={handleInputChange}
          className="p-2 text-sm sm:p-3 sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          name="type"
          value={newEntry.type}
          onChange={handleInputChange}
          className="p-2 text-sm sm:p-3 sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="Fixo">Fixo</option>
          <option value="Variável">Variável</option>
        </select>
      </div>

      <div className="flex justify-end space-x-2 sm:space-x-3 mb-6">
        {editingEntry ? (
          <button
            onClick={updateEntry}
            className="px-4 py-2 text-sm sm:px-6 sm:py-3 bg-green-600 text-white rounded-md shadow-md hover:bg-green-700 transition duration-200"
          >
            Atualizar Entrada
          </button>
        ) : (
          <button
            onClick={addEntry}
            className="px-4 py-2 text-sm sm:px-6 sm:py-3 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 transition duration-200"
          >
            Adicionar Entrada
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg overflow-hidden shadow-md">
          <thead className="bg-blue-100">
            <tr>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Data</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Descrição</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Valor</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Tipo</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Ações</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-3 px-4 text-sm text-center text-gray-500">Nenhuma entrada cadastrada para este mês.</td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
                  <td className="py-2 px-3 text-xs sm:text-sm text-gray-700">{entry.date}</td>
                  <td className="py-2 px-3 text-xs sm:text-sm text-gray-700">{entry.description}</td>
                  <td className="py-2 px-3 text-xs sm:text-sm text-gray-700">R$ {entry.value.toFixed(2)}</td>
                  <td className="py-2 px-3 text-xs sm:text-sm text-gray-700">{entry.type}</td>
                  <td className="py-2 px-3 text-xs sm:text-sm">
                    <button
                      onClick={() => startEditEntry(entry)}
                      className="text-blue-600 hover:text-blue-800 mr-2"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => deleteEntry(entry.id)}
                      className="text-red-600 hover:text-red-800 mr-2"
                    >
                      Excluir
                    </button>
                    {entry.type === 'Fixo' && (
                      <button
                        onClick={() => propagateSingleFixedEntry(entry)}
                        className="text-purple-600 hover:text-purple-800"
                      >
                        Propagar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Componente para a seção de Despesas
const ExpensesSection = ({ expenses, currentMonthIndex, currentYear }) => {
  const { db, userId, userConfig, showModal } = useContext(FirebaseContext);
  const [newExpense, setNewExpense] = useState({
    date: '',
    type: 'Fixo',
    category: userConfig.categories[0] || '',
    paymentMethod: userConfig.paymentMethods[0] || '',
    creditCardName: userConfig.creditCardNames[0] || '',
    description: '',
    value: '',
    installmentType: 'À Vista',
    installments: 1,
  });
  const [editingExpense, setEditingExpense] = useState(null);

  useEffect(() => {
    setNewExpense(prev => ({
      ...prev,
      category: userConfig.categories[0] || '',
      paymentMethod: userConfig.paymentMethods[0] || '',
      creditCardName: userConfig.creditCardNames[0] || '',
    }));
  }, [userConfig]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewExpense(prev => {
      const updatedExpense = { ...prev, [name]: value };

      if (name === 'paymentMethod' && value !== 'Cartão de Crédito') {
        updatedExpense.installmentType = 'À Vista';
        updatedExpense.installments = 1;
      }
      return updatedExpense;
    });
  };

  const addExpense = async () => {
    if (!db || !userId) return;
    if (!newExpense.date || !newExpense.description || !newExpense.value || !newExpense.category || !newExpense.paymentMethod) {
      showModal('Por favor, preencha todos os campos obrigatórios para adicionar uma despesa.');
      return;
    }

    const expenseDate = new Date(newExpense.date);
    const targetYear = expenseDate.getFullYear();
    const targetMonthIndex = expenseDate.getMonth();
    const monthStr = `${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}`;
    const expensesRef = collection(db, `artifacts/${db.app.options.projectId || 'default-app-id'}/users/${userId}/financialData/${monthStr}/expenses`);

    try {
      await addDoc(expensesRef, {
        ...newExpense,
        value: parseFloat(newExpense.value),
        installments: parseInt(newExpense.installments),
        date: expenseDate.toISOString().split('T')[0],
      });
      setNewExpense({
        date: '',
        type: 'Fixo',
        category: userConfig.categories[0] || '',
        paymentMethod: userConfig.paymentMethods[0] || '',
        creditCardName: userConfig.creditCardNames[0] || '',
        description: '',
        value: '',
        installmentType: 'À Vista',
        installments: 1,
      });
      showModal('Despesa adicionada com sucesso!');
    } catch (e) {
      console.error("Erro ao adicionar despesa: ", e);
      showModal('Erro ao adicionar despesa.');
    }
  };

  const startEditExpense = (expense) => {
    setEditingExpense({ ...expense });
    setNewExpense({ ...expense });
  };

  const updateExpense = async () => {
    if (!db || !userId || !editingExpense) return;
    if (!newExpense.date || !newExpense.description || !newExpense.value || !newExpense.category || !newExpense.paymentMethod) {
      showModal('Por favor, preencha todos os campos obrigatórios para atualizar a despesa.');
      return;
    }

    const expenseDate = new Date(newExpense.date);
    const targetYear = expenseDate.getFullYear();
    const targetMonthIndex = expenseDate.getMonth();
    const monthStr = `${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}`;
    const expenseDocRef = doc(db, `artifacts/${db.app.options.projectId || 'default-app-id'}/users/${userId}/financialData/${monthStr}/expenses`, editingExpense.id);

    try {
      await updateDoc(expenseDocRef, {
        ...newExpense,
        value: parseFloat(newExpense.value),
        installments: parseInt(newExpense.installments),
        date: expenseDate.toISOString().split('T')[0],
      });
      setEditingExpense(null);
      setNewExpense({
        date: '',
        type: 'Fixo',
        category: userConfig.categories[0] || '',
        paymentMethod: userConfig.paymentMethods[0] || '',
        creditCardName: userConfig.creditCardNames[0] || '',
        description: '',
        value: '',
        installmentType: 'À Vista',
        installments: 1,
      });
      showModal('Despesa atualizada com sucesso!');
    } catch (e) {
      console.error("Erro ao atualizar despesa: ", e);
      showModal('Erro ao atualizar despesa.');
    }
  };

  const deleteExpense = (expenseId) => {
    showModal('Tem certeza que deseja excluir esta despesa?', async () => {
      if (!db || !userId) return;
      const monthStr = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;
      const expenseDocRef = doc(db, `artifacts/${db.app.options.projectId || 'default-app-id'}/users/${userId}/financialData/${monthStr}/expenses`, expenseId);
      try {
        await deleteDoc(expenseDocRef);
        showModal('Despesa excluída com sucesso!');
      } catch (e) {
        console.error("Erro ao excluir despesa: ", e);
        showModal('Erro ao excluir despesa.');
      }
    }, true);
  };

  const propagateSingleFixedExpense = async (expenseToPropagate) => {
    showModal(`Deseja propagar a despesa fixa "${expenseToPropagate.description}" para os meses futuros do ano atual?`, async () => {
      if (!db || !userId) return;

      if (expenseToPropagate.type !== 'Fixo' || expenseToPropagate.installmentType !== 'À Vista') {
        showModal('Apenas despesas do tipo "Fixo" e "À Vista" podem ser propagadas individualmente.');
        return;
      }

      for (let i = currentMonthIndex + 1; i < 12; i++) {
        const futureMonthStr = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
        const futureExpensesRef = collection(db, `artifacts/${db.app.options.projectId || 'default-app-id'}/users/${userId}/financialData/${futureMonthStr}/expenses`);

        const q = query(futureExpensesRef,
          where("description", "==", expenseToPropagate.description),
          where("value", "==", expenseToPropagate.value),
          where("type", "==", expenseToPropagate.type),
          where("category", "==", expenseToPropagate.category)
        );
        const existingDocs = await getDocs(q);

        if (existingDocs.empty) {
          await addDoc(futureExpensesRef, {
            date: expenseToPropagate.date,
            description: expenseToPropagate.description,
            value: expenseToPropagate.value,
            type: expenseToPropagate.type,
            category: expenseToPropagate.category,
            paymentMethod: expenseToPropagate.paymentMethod,
            creditCardName: expenseToPropagate.creditCardName,
            installmentType: expenseToPropagate.installmentType,
            installments: expenseToPropagate.installments,
          });
        }
      }
      showModal('Despesa fixa propagada com sucesso!');
    }, true);
  };

  const getFilteredCreditCardNames = () => {
    if (newExpense.paymentMethod === 'Cartão de Crédito') {
      return userConfig.creditCardNames;
    }
    return [];
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 text-blue-700">Gestão de Despesas</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <input
          type="date"
          name="date"
          value={newExpense.date}
          onChange={handleInputChange}
          className="p-2 text-sm sm:p-3 sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          name="type"
          value={newExpense.type}
          onChange={handleInputChange}
          className="p-2 text-sm sm:p-3 sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {userConfig.expenseTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <select
          name="category"
          value={newExpense.category}
          onChange={handleInputChange}
          className="p-2 text-sm sm:p-3 sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {userConfig.categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          name="paymentMethod"
          value={newExpense.paymentMethod}
          onChange={handleInputChange}
          className="p-2 text-sm sm:p-3 sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {userConfig.paymentMethods.map(method => (
            <option key={method} value={method}>{method}</option>
          ))}
        </select>
        {newExpense.paymentMethod === 'Cartão de Crédito' && (
          <select
            name="creditCardName"
            value={newExpense.creditCardName}
            onChange={handleInputChange}
            className="p-2 text-sm sm:p-3 sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {getFilteredCreditCardNames().map(card => (
              <option key={card} value={card}>{card}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          name="description"
          placeholder="Descrição"
          value={newExpense.description}
          onChange={handleInputChange}
          className="p-2 text-sm sm:p-3 sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="number"
          name="value"
          placeholder="Valor"
          value={newExpense.value}
          onChange={handleInputChange}
          className="p-2 text-sm sm:p-3 sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {newExpense.paymentMethod === 'Cartão de Crédito' && (
          <>
            <select
              name="installmentType"
              value={newExpense.installmentType}
              onChange={handleInputChange}
              className="p-2 text-sm sm:p-3 sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="À Vista">À Vista</option>
              <option value="Parcelado">Parcelado</option>
            </select>
            {newExpense.installmentType === 'Parcelado' && (
              <input
                type="number"
                name="installments"
                placeholder="Nº de Parcelas"
                value={newExpense.installments}
                onChange={handleInputChange}
                min="1"
                className="p-2 text-sm sm:p-3 sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </>
        )}
      </div>

      <div className="flex justify-end space-x-2 sm:space-x-3 mb-6">
        {editingExpense ? (
          <button
            onClick={updateExpense}
            className="px-4 py-2 text-sm sm:px-6 sm:py-3 bg-green-600 text-white rounded-md shadow-md hover:bg-green-700 transition duration-200"
          >
            Atualizar Despesa
          </button>
        ) : (
          <button
            onClick={addExpense}
            className="px-4 py-2 text-sm sm:px-6 sm:py-3 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 transition duration-200"
          >
            Adicionar Despesa
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg overflow-hidden shadow-md">
          <thead className="bg-blue-100">
            <tr>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Data</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Descrição</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Valor</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Tipo</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Categoria</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Pagamento</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Parcelas</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Ações</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr>
                <td colSpan="8" className="py-3 px-4 text-sm text-center text-gray-500">Nenhuma despesa cadastrada para este mês.</td>
              </tr>
            ) : (
              expenses.map((expense) => (
                <tr key={expense.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
                  <td className="py-2 px-3 text-xs sm:text-sm text-gray-700">{expense.date}</td>
                  <td className="py-2 px-3 text-xs sm:text-sm text-gray-700">{expense.description}</td>
                  <td className="py-2 px-3 text-xs sm:text-sm text-gray-700">R$ {expense.value.toFixed(2)}</td>
                  <td className="py-2 px-3 text-xs sm:text-sm text-gray-700">{expense.type}</td>
                  <td className="py-2 px-3 text-xs sm:text-sm text-gray-700">{expense.category}</td>
                  <td className="py-2 px-3 text-xs sm:text-sm text-gray-700">
                    {expense.paymentMethod} {expense.paymentMethod === 'Cartão de Crédito' && `(${expense.creditCardName})`}
                  </td>
                  <td className="py-2 px-3 text-xs sm:text-sm text-gray-700">
                    {expense.installmentType === 'Parcelado' ? `${expense.installments}x` : 'À Vista'}
                  </td>
                  <td className="py-2 px-3 text-xs sm:text-sm">
                    <button
                      onClick={() => startEditExpense(expense)}
                      className="text-blue-600 hover:text-blue-800 mr-1 sm:mr-2"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => deleteExpense(expense.id)}
                      className="text-red-600 hover:text-red-800 mr-1 sm:mr-2"
                    >
                      Excluir
                    </button>
                    {expense.type === 'Fixo' && expense.installmentType === 'À Vista' && (
                      <button
                        onClick={() => propagateSingleFixedExpense(expense)}
                        className="text-purple-600 hover:text-purple-800"
                      >
                        Propagar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ExpenseDistributionChart expenses={expenses} />
    </div>
  );
};

// Componente para o gráfico de distribuição de despesas por categoria
const ExpenseDistributionChart = ({ expenses }) => {
  const categoryData = expenses.reduce((acc, expense) => {
    acc[expense.category] = (acc[expense.category] || 0) + expense.value;
    return acc;
  }, {});

  const data = Object.keys(categoryData).map(category => ({
    name: category,
    value: categoryData[category],
  }));

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF194F', '#19FFD4', '#FFD419'];

  if (data.length === 0) {
    return (
      <div className="mt-8 p-4 bg-gray-50 rounded-lg text-center text-gray-600 text-sm sm:text-base">
        Nenhuma despesa para exibir no gráfico.
      </div>
    );
  }

  return (
    <div className="mt-8 bg-white p-6 rounded-lg shadow-lg">
      <h3 className="text-lg sm:text-xl font-bold mb-4 text-blue-700">Despesas por Categoria</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={100}
            fill="#8884d8"
            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => `R$ ${value.toFixed(2)}`} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

// Componente para a seção de Configurações
const SettingsSection = () => {
  const { db, userId, userConfig, setUserConfig, showModal } = useContext(FirebaseContext);
  const [newCategory, setNewCategory] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState('');
  const [newExpenseType, setNewExpenseType] = useState('');
  const [newCreditCardName, setNewCreditCardName] = useState('');

  const saveConfig = async (updatedConfig) => {
    if (!db || !userId) return;
    const userConfigRef = doc(db, `artifacts/${db.app.options.projectId || 'default-app-id'}/users/${userId}/userConfig`, 'settings');
    try {
      await setDoc(userConfigRef, updatedConfig, { merge: true });
      setUserConfig(updatedConfig);
      showModal('Configurações salvas com sucesso!');
    } catch (e) {
      console.error("Erro ao salvar configurações: ", e);
      showModal('Erro ao salvar configurações.');
    }
  };

  const addToList = (listName, newItem, setItem) => {
    if (newItem.trim() === '') {
      showModal('Por favor, insira um valor para adicionar.');
      return;
    }
    const updatedList = [...userConfig[listName], newItem.trim()];
    saveConfig({ ...userConfig, [listName]: updatedList });
    setItem('');
  };

  const removeFromList = (listName, itemToRemove) => {
    showModal(`Tem certeza que deseja remover "${itemToRemove}"?`, () => {
      const updatedList = userConfig[listName].filter(item => item !== itemToRemove);
      saveConfig({ ...userConfig, [listName]: updatedList });
    }, true);
  };

  const renderListEditor = (title, list, newItemState, setNewItemState, addFunction, removeFunction) => (
    <div className="mb-6 p-4 border border-gray-200 rounded-md bg-gray-50">
      <h3 className="text-lg sm:text-xl font-semibold mb-3 text-gray-700">{title}</h3>
      <div className="flex mb-3">
        <input
          type="text"
          value={newItemState}
          onChange={(e) => setNewItemState(e.target.value)}
          placeholder={`Adicionar novo ${title.toLowerCase().slice(0, -1)}`}
          className="flex-1 p-2 text-sm sm:p-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={addFunction}
          className="px-3 py-1 text-sm sm:px-4 sm:py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700 transition duration-200"
        >
          Adicionar
        </button>
      </div>
      <ul className="space-y-2">
        {list.map((item, index) => (
          <li key={index} className="flex justify-between items-center bg-white p-2 rounded-md shadow-sm text-sm sm:text-base">
            <span className="text-gray-700">{item}</span>
            <button
              onClick={() => removeFunction(item)}
              className="text-red-600 hover:text-red-800 text-xs sm:text-sm"
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 text-blue-700">Configurações Personalizáveis</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderListEditor(
          'Categorias',
          userConfig.categories,
          newCategory,
          setNewCategory,
          () => addToList('categories', newCategory, setNewCategory),
          (item) => removeFromList('categories', item)
        )}
        {renderListEditor(
          'Meios de Pagamento',
          userConfig.paymentMethods,
          newPaymentMethod,
          setNewPaymentMethod,
          () => addToList('paymentMethods', newPaymentMethod, setNewPaymentMethod),
          (item) => removeFromList('paymentMethods', item)
        )}
        {renderListEditor(
          'Tipos de Despesa',
          userConfig.expenseTypes,
          newExpenseType,
          setNewExpenseType,
          () => addToList('expenseTypes', newExpenseType, setNewExpenseType),
          (item) => removeFromList('expenseTypes', item)
        )}
        {renderListEditor(
          'Nomes de Cartões de Crédito',
          userConfig.creditCardNames,
          newCreditCardName,
          setNewCreditCardName,
          () => addToList('creditCardNames', newCreditCardName, setNewCreditCardName),
          (item) => removeFromList('creditCardNames', item)
        )}
      </div>
    </div>
  );
};

// Componente para o Resumo Anual
const AnnualSummary = ({ currentYear, activeTab }) => {
  const { db, userId, showModal, setGlobalLoading } = useContext(FirebaseContext);
  const [annualData, setAnnualData] = useState([]);
  const [loadingAnnual, setLoadingAnnual] = useState(false);

  const months = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];

  useEffect(() => {
    const fetchAnnualData = async () => {
      if (!db || !userId || activeTab !== 'resumo-anual') {
        console.log("AnnualSummary: Skipping fetch, conditions not met.");
        return;
      }
      setGlobalLoading(true);
      setLoadingAnnual(true);
      let accumulatedBalance = 0;

      const previousYear = currentYear - 1;
      let prevYearAccumulated = 0;
      try {
        for (let i = 0; i < 12; i++) {
          const prevMonthStr = `${previousYear}-${String(i + 1).padStart(2, '0')}`;
          const prevEntriesRef = collection(db, `artifacts/${db.app.options.projectId || 'default-app-id'}/users/${userId}/financialData/${prevMonthStr}/entries`);
          const prevExpensesRef = collection(db, `artifacts/${db.app.options.projectId || 'default-app-id'}/users/${userId}/financialData/${prevMonthStr}/expenses`);

          const prevEntriesSnap = await getDocs(prevEntriesRef);
          const prevExpensesSnap = await getDocs(prevExpensesRef);

          const prevTotalEntries = prevEntriesSnap.docs.reduce((sum, doc) => sum + doc.data().value, 0);
          const prevTotalExpenses = prevExpensesSnap.docs.reduce((sum, doc) => sum + doc.data().value, 0);
          prevYearAccumulated += (prevTotalEntries - prevTotalExpenses);
        }
        accumulatedBalance = prevYearAccumulated;
        console.log("AnnualSummary: Previous year accumulated balance loaded:", accumulatedBalance);

      } catch (error) {
        console.warn(`AnnualSummary: Não foi possível carregar o saldo do ano anterior (${previousYear}). Iniciando com saldo zero.`, error);
        accumulatedBalance = 0;
      }

      const monthlySummaries = [];

      for (let i = 0; i < 12; i++) {
        const monthStr = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
        const entriesRef = collection(db, `artifacts/${db.app.options.projectId || 'default-app-id'}/users/${userId}/financialData/${monthStr}/entries`);
        const expensesRef = collection(db, `artifacts/${db.app.options.projectId || 'default-app-id'}/users/${userId}/financialData/${monthStr}/expenses`);

        try {
          const entriesSnapshot = await getDocs(entriesRef);
          const expensesSnapshot = await getDocs(expensesRef);

          const totalEntries = entriesSnapshot.docs.reduce((sum, doc) => sum + doc.data().value, 0);
          const totalExpenses = expensesSnapshot.docs.reduce((sum, doc) => sum + doc.data().value, 0);
          const netBalance = totalEntries - totalExpenses;
          accumulatedBalance += netBalance;

          monthlySummaries.push({
            month: months[i],
            totalEntries,
            totalExpenses,
            netBalance,
            accumulatedBalance,
          });
          console.log(`AnnualSummary: Data fetched for ${monthStr}.`);
        } catch (error) {
          console.error(`AnnualSummary: Erro ao buscar dados para ${monthStr}:`, error);
          monthlySummaries.push({
            month: months[i],
            totalEntries: 0,
            totalExpenses: 0,
            netBalance: 0,
            accumulatedBalance: accumulatedBalance,
          });
        }
      }
      setAnnualData(monthlySummaries);
      setLoadingAnnual(false);
      setGlobalLoading(false);
      console.log("AnnualSummary: All annual data fetched and loading complete.");
    };

    fetchAnnualData();
  }, [db, userId, currentYear, activeTab, db.app.options.projectId, setGlobalLoading]);

  const exportToCSV = () => {
    if (annualData.length === 0) {
      showModal('Não há dados para exportar.');
      return;
    }

    let csvContent = "Mês,Entradas Totais,Despesas Totais,Saldo Líquido Mensal,Saldo Acumulado\n";
    annualData.forEach(row => {
      csvContent += `${row.month},${row.totalEntries.toFixed(2)},${row.totalExpenses.toFixed(2)},${row.netBalance.toFixed(2)},${row.accumulatedBalance.toFixed(2)}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `resumo_financeiro_anual_${currentYear}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showModal('Dados exportados para CSV com sucesso!');
    } else {
      showModal('Seu navegador não suporta a exportação direta de CSV.');
    }
  };

  if (loadingAnnual) {
    return (
      <div className="flex items-center justify-center min-h-[200px] bg-gray-50 rounded-lg shadow-md">
        <div className="text-lg font-semibold text-gray-600">Carregando resumo anual...</div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
      <h2 className="text-xl sm:text-2xl font-bold mb-4 text-blue-700">Resumo Anual ({currentYear})</h2>

      <div className="flex justify-end mb-4">
        <button
          onClick={exportToCSV}
          className="px-4 py-2 text-sm sm:px-6 sm:py-3 bg-green-600 text-white rounded-md shadow-md hover:bg-green-700 transition duration-200"
        >
          Exportar para CSV
        </button>
      </div>

      <div className="overflow-x-auto mb-8">
        <table className="min-w-full bg-white rounded-lg overflow-hidden shadow-md">
          <thead className="bg-blue-100">
            <tr>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Mês</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Entradas Totais</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Despesas Totais</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Saldo Líquido Mensal</th>
              <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Saldo Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {annualData.map((data, index) => (
              <tr key={index} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
                  <td className="py-2 px-3 text-xs sm:text-sm text-gray-700">{data.month}</td>
                  <td className="py-2 px-3 text-xs sm:text-sm text-green-600">R$ {data.totalEntries.toFixed(2)}</td>
                  <td className="py-2 px-3 text-xs sm:text-sm text-red-600">R$ {data.totalExpenses.toFixed(2)}</td>
                  <td className={`py-2 px-3 text-xs sm:text-sm ${data.netBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    R$ {data.netBalance.toFixed(2)}
                  </td>
                  <td className={`py-2 px-3 text-xs sm:text-sm ${data.accumulatedBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    R$ {data.accumulatedBalance.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="text-lg sm:text-xl font-bold mb-4 text-blue-700">Evolução Financeira Anual</h3>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart
            data={annualData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{fontSize: 10}} />
            <YAxis tick={{fontSize: 10}} />
            <Tooltip formatter={(value) => `R$ ${value.toFixed(2)}`} />
            <Legend wrapperStyle={{fontSize: '12px'}} />
            <Line type="monotone" dataKey="totalEntries" stroke="#82ca9d" name="Entradas Totais" />
            <Line type="monotone" dataKey="totalExpenses" stroke="#ff7300" name="Despesas Totais" />
            <Line type="monotone" dataKey="accumulatedBalance" stroke="#8884d8" name="Saldo Acumulado" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // Componente para a Projeção de Saldo Diário
  const DailyProjection = ({ entries, expenses, currentMonthIndex, currentYear }) => {
    const [dailyProjection, setDailyProjection] = useState([]);

    useEffect(() => {
      const calculateDailyProjection = () => {
        const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();
        const projection = [];
        let currentBalance = 0;

        const sortedTransactions = [...entries, ...expenses].sort((a, b) => {
          return new Date(a.date) - new Date(b.date);
        });

        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          let dailyNet = 0;

          sortedTransactions.forEach(transaction => {
            if (transaction.date === dateStr) {
              if (transaction.description) {
                dailyNet += transaction.value;
              } else {
                dailyNet -= transaction.value;
              }
            }
          });
          currentBalance += dailyNet;
          projection.push({ date: dateStr, dailyNet: dailyNet, balance: currentBalance });
        }
        setDailyProjection(projection);
      };

      calculateDailyProjection();
    }, [entries, expenses, currentMonthIndex, currentYear]);

    return (
      <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 text-blue-700">Projeção de Saldo Diário</h2>

        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg overflow-hidden shadow-md">
            <thead className="bg-blue-100">
              <tr>
                <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Data</th>
                <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Movimento Diário</th>
                <th className="py-2 px-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Saldo Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {dailyProjection.length === 0 ? (
                <tr>
                  <td colSpan="3" className="py-3 px-4 text-sm text-center text-gray-500">Nenhuma transação para projetar.</td>
                </tr>
              ) : (
                dailyProjection.map((dayData, index) => (
                  <tr key={index} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
                    <td className="py-2 px-3 text-xs sm:text-sm text-gray-700">{dayData.date}</td>
                    <td className={`py-2 px-3 text-xs sm:text-sm ${dayData.dailyNet >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      R$ {dayData.dailyNet.toFixed(2)}
                    </td>
                    <td className={`py-2 px-3 text-xs sm:text-sm ${dayData.balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      R$ {dayData.balance.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Novo componente para o Resumo Mensal com gráfico de pizza
  const MonthlySummaryChart = ({ entries, expenses, currentMonthIndex, currentYear }) => {
    const [chartData, setChartData] = useState([]);
    const [totalIncome, setTotalIncome] = useState(0);
    const [totalExpenses, setTotalExpenses] = useState(0);
    const [balance, setBalance] = useState(0);

    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    useEffect(() => {
      const calculateMonthlySummary = () => {
        const currentMonthTotalIncome = entries.reduce((sum, entry) => sum + entry.value, 0);
        const currentMonthTotalExpenses = expenses.reduce((sum, expense) => sum + expense.value, 0);
        const currentMonthBalance = currentMonthTotalIncome - currentMonthTotalExpenses;

        setTotalIncome(currentMonthTotalIncome);
        setTotalExpenses(currentMonthTotalExpenses);
        setBalance(currentMonthBalance);

        const categorySpending = expenses.reduce((acc, expense) => {
          acc[expense.category] = (acc[expense.category] || 0) + expense.value;
          return acc;
        }, {});

        const data = Object.keys(categorySpending).map(category => {
          const percentage = currentMonthTotalIncome > 0 ? (categorySpending[category] / currentMonthTotalIncome) * 100 : 0;
          return {
            name: `${category} (${percentage.toFixed(1)}%)`,
            value: categorySpending[category],
            percentage: percentage,
          };
        });

        setChartData(data);
      };

      calculateMonthlySummary();
    }, [entries, expenses, currentMonthIndex, currentYear]);

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF194F', '#19FFD4', '#FFD419', '#A2D9CE', '#F7DC6F'];

    return (
      <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 text-blue-700">Resumo Mensal ({months[currentMonthIndex]} de {currentYear})</h2>

        <div className="flex flex-col items-center mb-6">
          <p className="text-base sm:text-lg text-gray-700">
            <span className="font-semibold">Entradas Totais:</span> <span className="text-green-600">R$ {totalIncome.toFixed(2)}</span>
          </p>
          <p className="text-base sm:text-lg text-gray-700">
            <span className="font-semibold">Despesas Totais:</span> <span className="text-red-600">R$ {totalExpenses.toFixed(2)}</span>
          </p>
          <p className="text-lg sm:text-xl font-bold mt-2">
            <span className="font-semibold">Saldo Líquido:</span>{' '}
            <span className={`${balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>R$ {balance.toFixed(2)}</span>
          </p>
        </div>

        {chartData.length === 0 || totalIncome === 0 ? (
          <div className="mt-8 p-4 bg-gray-50 rounded-lg text-center text-gray-600 text-sm sm:text-base">
            Nenhum dado de despesa ou entrada para exibir no gráfico para este mês.
          </div>
        ) : (
          <div className="mt-8">
            <h3 className="text-lg sm:text-xl font-bold mb-4 text-blue-700">Distribuição de Gastos em Relação à Entrada</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => `${name}`}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name, props) => [`R$ ${value.toFixed(2)}`, `${props.payload.name}`]} />
                <Legend wrapperStyle={{fontSize: '12px'}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  };

  export default App;
