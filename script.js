"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Player, ScheduleItem, BehaviorItem, MartItem, LogEntry, PottyLogEntry, LogCategory } from '@/lib/types';
import { INITIAL_PLAYERS, INITIAL_SCHEDULE, BEHAVIORS, BONUSES as BONUSES_DATA, MOO_MART_ITEMS } from '@/lib/constants';
import { useToast } from "@/hooks/use-toast";
import { isToday } from 'date-fns';
import { useLocalStorage } from '@/hooks/use-local-storage';

// NOTE: This is a copy of the AppContext for export.
// In a real static build, you would need a build process to compile this
// and all its dependencies into a single script.js file.

interface AppContextType {
  players: Player[];
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  logs: LogEntry[];
  pottyLogs: PottyLogEntry[];
  selectedPlayerIds: number[];
  togglePlayerSelection: (playerId: number) => void;
  isPlayerSelected: (playerId: number) => boolean;
  schedule: ScheduleItem[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
  behaviors: BehaviorItem[];
  bonuses: ScheduleItem[];
  setBonuses: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
  martItems: MartItem[];
  updatePlayerBalance: (playerId: number, amount: number, description: string, category: LogCategory) => void;
  setPlayerBalance: (playerId: number, newBalance: number) => void;
  deletePlayer: (playerId: number) => void;
  addPlayer: (name: string, avatar: string) => void;
  undoLastAction: () => void;
  transferToSavings: (playerId: number, amount: number) => void;
  withdrawFromSavings: (playerId: number, amount: number) => void;
  buyStock: (playerId: number, ticker: string, shares: number, price: number) => void;
  sellStock: (playerId: number, ticker: string, shares: number, price: number) => void;
  takeLoan: (playerId: number, amount: number) => void;
  repayLoan: (playerId: number, amount: number) => void;
  addPottyLog: (playerId: number, data: Omit<PottyLogEntry, 'id' | 'timestamp' | 'playerId' | 'playerName'>) => void;
  applyBehaviorDeduction: (playerId: number, behaviorDescription: string, deduction: number) => void;
  penaltyInfo: { title: string; description: string } | null;
  setPenaltyInfo: React.Dispatch<React.SetStateAction<{ title: string; description: string } | null>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { toast } = useToast();
  const [players, setPlayers] = useLocalStorage<Player[]>('mooberry-players', INITIAL_PLAYERS);
  const [schedule, setSchedule] = useLocalStorage<ScheduleItem[]>('mooberry-schedule', INITIAL_SCHEDULE);
  const [logs, setLogs] = useLocalStorage<LogEntry[]>('mooberry-logs', []);
  const [pottyLogs, setPottyLogs] = useLocalStorage<PottyLogEntry[]>('mooberry-potty-logs', []);
  const [selectedPlayerIds, setSelectedPlayerIds] = useLocalStorage<number[]>('mooberry-selected-player-ids', []);
  const [bonuses, setBonuses] = useLocalStorage<ScheduleItem[]>('mooberry-bonuses', BONUSES_DATA);
  const [penaltyInfo, setPenaltyInfo] = useState<{ title: string; description: string } | null>(null);

  useEffect(() => {
    // If a selected player was deleted, this cleans up the selection.
    const existingPlayerIds = players.map(p => p.id);
    const newSelectedIds = selectedPlayerIds.filter(id => existingPlayerIds.includes(id));

    if (newSelectedIds.length !== selectedPlayerIds.length) {
      setSelectedPlayerIds(newSelectedIds);
    } 
    // If no players are selected and players exist, select the first one.
    else if (newSelectedIds.length === 0 && players.length > 0) {
      setSelectedPlayerIds([players[0].id]);
    }
  }, [players, selectedPlayerIds, setSelectedPlayerIds]);


  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'timestamp' | 'playerName'>) => {
    const player = players.find(p => p.id === entry.playerId);
    if (!player) return;

    const newLog: LogEntry = {
      ...entry,
      id: new Date().toISOString() + Math.random(),
      timestamp: new Date().toISOString(),
      playerName: player.name,
    };
    setLogs(prevLogs => [newLog, ...prevLogs]);
  }, [players, setLogs]);

  const updatePlayerBalance = useCallback((playerId: number, amount: number, description: string, category: LogCategory) => {
    let playerUpdated = false;
    setPlayers(prevPlayers =>
      prevPlayers.map(p => {
        if (p.id === playerId) {
          playerUpdated = true;
          const newBalance = p.balance + amount;
          
          const newStats = { ...p.stats };
          
          switch (category) {
              case 'task': newStats.tasksCompleted += 1; break;
              case 'bonus': newStats.bonuses += 1; break;
              case 'behavior': newStats.behaviors += 1; break;
              case 'mart': newStats.purchases += 1; break;
              case 'bank':
              case 'loan':
                  newStats.bankTransactions +=1; break;
              case 'potty': newStats.pottySuccesses +=1; break;
          }

          return { ...p, balance: newBalance, stats: newStats };
        }
        return p;
      })
    );

    if (playerUpdated) {
        addLog({ playerId, description, amount, category });
        if (amount !== 0) {
            const player = players.find(p => p.id === playerId);
            toast({
                title: `Transaction for ${player?.name} Logged!`,
                description: `${description}: ${amount > 0 ? '+' : ''}$${Math.abs(amount).toFixed(2)}`,
            });
        }
    }
  }, [addLog, toast, setPlayers, players]);

  const setPlayerBalance = useCallback((playerId: number, newBalance: number) => {
    const player = players.find(p => p.id === playerId);
    if (!player || player.balance === newBalance) {
        return;
    }

    const amountDifference = newBalance - player.balance;
    addLog({ playerId, description: 'Balance manually adjusted', amount: amountDifference, category: 'bank' });

    toast({
        title: `Balance Updated!`,
        description: `${player.name}'s balance set to $${newBalance.toFixed(2)}`,
    });

    setPlayers(prevPlayers => prevPlayers.map(p => {
        if (p.id === playerId) {
            const newStats = { ...p.stats, bankTransactions: p.stats.bankTransactions + 1 };
            return { ...p, balance: newBalance, stats: newStats };
        }
        return p;
    }));
  }, [players, addLog, setPlayers, toast]);

  const applyBehaviorDeduction = useCallback((playerId: number, behaviorDescription: string, deduction: number) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const descriptionForLog = `Behavior: ${behaviorDescription}`;
    
    const repeatedCount = logs.filter(log =>
        log.playerId === playerId &&
        log.description === descriptionForLog &&
        isToday(new Date(log.timestamp))
    ).length;

    updatePlayerBalance(playerId, -deduction, descriptionForLog, 'behavior');

    if (repeatedCount + 1 >= 3) {
        const penaltyAmount = 30;
        const penaltyLogDescription = `Penalty for 3x "${behaviorDescription}"`;
        updatePlayerBalance(playerId, -penaltyAmount, penaltyLogDescription, 'behavior');
        setPenaltyInfo({
            title: 'Penalty Applied!',
            description: `${player.name} has been penalized $${penaltyAmount} for repeated misbehavior. Assignment: 3 pages on "${behaviorDescription}".`
        });
    }
  }, [players, logs, updatePlayerBalance]);


  const deletePlayer = (playerId: number) => {
    setPlayers(prevPlayers => prevPlayers.filter(p => p.id !== playerId));
    setSelectedPlayerIds(prevIds => prevIds.filter(id => id !== playerId));
    toast({ title: "Player Deleted", description: "The player has been removed." });
  };
  
  const addPlayer = (name: string, avatar: string) => {
    const newPlayer: Player = {
        id: Date.now(),
        name,
        avatar,
        balance: 100,
        pin: '8888',
        stats: { tasksCompleted: 0, bonuses: 0, behaviors: 0, purchases: 0, bankTransactions: 0, pottySuccesses: 0 },
        savings: 0,
        stocks: {},
        loan: null,
    };
    setPlayers(prev => [...prev, newPlayer]);
    setSelectedPlayerIds([newPlayer.id]);
    toast({ title: "Player Added", description: `${name} has joined!` });
  };

  const undoLastAction = () => {
      toast({ title: "Undo", description: "This feature is coming soon!" });
  };

  const transferToSavings = (playerId: number, amount: number) => {
    setPlayers(prev => prev.map(p => {
        if (p.id === playerId) {
            if (p.balance < amount) {
                toast({ variant: "destructive", title: "Insufficient funds", description: "Not enough money in wallet." });
                return p;
            }
            addLog({ playerId, description: `Transfer to savings`, amount: -amount, category: 'bank' });
            toast({ title: "Transfer Successful", description: `$${amount.toFixed(2)} moved to savings.`})
            const newStats = {...p.stats, bankTransactions: p.stats.bankTransactions + 1 };
            return { ...p, balance: p.balance - amount, savings: p.savings + amount, stats: newStats };
        }
        return p;
    }));
  };

  const withdrawFromSavings = (playerId: number, amount: number) => {
    setPlayers(prev => prev.map(p => {
        if (p.id === playerId) {
            if (p.savings < amount) {
                toast({ variant: "destructive", title: "Insufficient savings", description: "Not enough money in savings." });
                return p;
            }
            addLog({ playerId, description: `Withdraw from savings`, amount: amount, category: 'bank' });
            toast({ title: "Withdrawal Successful", description: `$${amount.toFixed(2)} moved to wallet.`})
            const newStats = {...p.stats, bankTransactions: p.stats.bankTransactions + 1 };
            return { ...p, savings: p.savings - amount, balance: p.balance + amount, stats: newStats };
        }
        return p;
    }));
  };

  const buyStock = (playerId: number, ticker: string, shares: number, price: number) => {
    setPlayers(prev => prev.map(p => {
        if (p.id === playerId) {
            const cost = shares * price;
            if (p.balance < cost) {
                toast({ variant: "destructive", title: "Insufficient funds" });
                return p;
            }
            const newStocks = { ...p.stocks, [ticker]: (p.stocks[ticker] || 0) + shares };
            addLog({ playerId, description: `Bought ${shares} ${ticker} stock`, amount: -cost, category: 'bank' });
            toast({ title: "Stock Purchased", description: `Bought ${shares} share(s) of ${ticker}.` });
            const newStats = {...p.stats, bankTransactions: p.stats.bankTransactions + 1 };
            return { ...p, balance: p.balance - cost, stocks: newStocks, stats: newStats };
        }
        return p;
    }));
  };

  const sellStock = (playerId: number, ticker: string, shares: number, price: number) => {
      setPlayers(prev => prev.map(p => {
          if (p.id === playerId) {
              if (!p.stocks[ticker] || p.stocks[ticker] < shares) {
                  toast({ variant: "destructive", title: "Not enough shares" });
                  return p;
              }
              const earnings = shares * price;
              const newStocks = { ...p.stocks };
              newStocks[ticker] -= shares;
              if (newStocks[ticker] === 0) {
                  delete newStocks[ticker];
              }
              addLog({ playerId, description: `Sold ${shares} ${ticker} stock`, amount: earnings, category: 'bank' });
              toast({ title: "Stock Sold", description: `Sold ${shares} share(s) of ${ticker}.` });
              const newStats = {...p.stats, bankTransactions: p.stats.bankTransactions + 1 };
              return { ...p, balance: p.balance + earnings, stocks: newStocks, stats: newStats };
          }
          return p;
      }));
  };

  const takeLoan = (playerId: number, amount: number) => {
    setPlayers(prev => prev.map(p => {
        if (p.id === playerId) {
            if (p.loan) {
                toast({ variant: "destructive", title: "Loan already exists", description: "You must pay off your current loan first." });
                return p;
            }
            addLog({ playerId, description: `Took a loan`, amount, category: 'loan' });
            toast({ title: "Loan Granted!", description: `$${amount.toFixed(2)} has been added to your wallet.` });
            const newStats = {...p.stats, bankTransactions: p.stats.bankTransactions + 1 };
            return { ...p, balance: p.balance + amount, loan: { principal: amount, paid: 0 }, stats: newStats};
        }
        return p;
    }));
  };

  const repayLoan = (playerId: number, amount: number) => {
      setPlayers(prev => prev.map(p => {
          if (p.id === playerId && p.loan) {
              if (p.balance < amount) {
                  toast({ variant: "destructive", title: "Insufficient funds" });
                  return p;
              }
              const remaining = p.loan.principal - p.loan.paid;
              const payment = Math.min(amount, remaining);
              const newLoan = { ...p.loan, paid: p.loan.paid + payment };
              
              addLog({ playerId, description: `Repaid loan`, amount: -payment, category: 'loan' });
              const newStats = {...p.stats, bankTransactions: p.stats.bankTransactions + 1 };
              
              if (newLoan.paid >= newLoan.principal) {
                  toast({ title: "Loan Paid Off!" });
                  return { ...p, balance: p.balance - payment, loan: null, stats: newStats };
              } else {
                toast({ title: "Payment Successful", description: `Paid $${payment.toFixed(2)} towards your loan.` });
              }
              return { ...p, balance: p.balance - payment, loan: newLoan, stats: newStats };
          }
          return p;
      }));
  };

  const addPottyLog = (playerId: number, data: Omit<PottyLogEntry, 'id' | 'timestamp' | 'playerId' | 'playerName'>) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const newLog: PottyLogEntry = {
      ...data,
      id: new Date().toISOString() + Math.random(),
      timestamp: new Date().toISOString(),
      playerId,
      playerName: player.name,
    };

    setPottyLogs(prev => [newLog, ...prev]);
    toast({ title: "Potty Logged!", description: `New entry for ${player.name} has been saved.`});
    
    updatePlayerBalance(playerId, 0, `Potty Success: ${data.type}`, 'potty' );
  };

  const togglePlayerSelection = (playerId: number) => {
    setSelectedPlayerIds(prevIds => {
      if (prevIds.includes(playerId)) {
        return prevIds.filter(id => id !== playerId);
      } else {
        return [...prevIds, playerId];
      }
    });
  };

  const isPlayerSelected = (playerId: number) => {
    return selectedPlayerIds.includes(playerId);
  };

  return (
    <AppContext.Provider value={{
      players,
      setPlayers,
      logs,
      pottyLogs,
      selectedPlayerIds,
      togglePlayerSelection,
      isPlayerSelected,
      schedule,
      setSchedule,
      behaviors: BEHAVIORS,
      bonuses,
      setBonuses,
      martItems: MOO_MART_ITEMS,
      updatePlayerBalance,
      setPlayerBalance,
      deletePlayer,
      addPlayer,
      undoLastAction,
      transferToSavings,
      withdrawFromSavings,
      buyStock,
      sellStock,
      takeLoan,
      repayLoan,
      addPottyLog,
      applyBehaviorDeduction,
      penaltyInfo,
      setPenaltyInfo,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
