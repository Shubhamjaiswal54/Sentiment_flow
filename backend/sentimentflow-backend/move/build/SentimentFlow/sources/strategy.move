module sentiment_flow::strategy {
    use std::signer;
    use std::string::String;
    use std::vector;
    use aptos_std::smart_table::{Self, SmartTable};
    use aptos_framework::event;

    /// Error codes
    const E_STRATEGY_STORE_NOT_FOUND: u64 = 1;
    const E_STRATEGY_ALREADY_EXISTS: u64 = 2;
    const E_STRATEGY_NOT_FOUND: u64 = 3;
    const E_STRATEGY_ALREADY_EXECUTED: u64 = 4;
    const E_STRATEGY_EXPIRED: u64 = 5;
    const E_CONDITIONS_NOT_MET: u64 = 8; // New Error Code

    struct StrategyStore has key {
        strategies: SmartTable<String, Strategy>,
    }

    struct Strategy has store, drop {
        id: String,
        market_id: String,
        sentiment_tag: String,
        min_prediction_prob: u64,
        min_sentiment_score: u64,
        notional_amount: u64,
        expiry_timestamp: u64,
        executed: bool,
    }

    #[event]
    struct StrategyRegistered has drop, store {
        owner: address,
        strategy_id: String,
        market_id: String,
    }

    #[event]
    struct StrategyExecuted has drop, store {
        strategy_id: String,
        executor: address,
        prob_bps: u64,
        sentiment_bps: u64,
        amount_traded: u64,
    }

    /// Register a new strategy
    public entry fun register_strategy(
        account: &signer,
        strategy_id: String,
        market_id: String,
        sentiment_tag: String,
        min_prediction_prob: u64,
        min_sentiment_score: u64,
        notional_amount: u64,
        _max_slippage_bps: u64,
        expiry_timestamp: u64
    ) acquires StrategyStore {
        let owner = signer::address_of(account);

        if (!exists<StrategyStore>(owner)) {
            move_to(account, StrategyStore {
                strategies: smart_table::new(),
            });
        };

        let store = borrow_global_mut<StrategyStore>(owner);
        assert!(!smart_table::contains(&store.strategies, strategy_id), E_STRATEGY_ALREADY_EXISTS);

        let new_strategy = Strategy {
            id: strategy_id,
            market_id: market_id, // Copy 1
            sentiment_tag,
            min_prediction_prob,
            min_sentiment_score,
            notional_amount,
            expiry_timestamp,
            executed: false,
        };

        smart_table::add(&mut store.strategies, strategy_id, new_strategy);

        event::emit(StrategyRegistered {
            owner,
            strategy_id, 
            market_id, // Copy 2
        });
    }

    /// =========================================================
    /// 👇 THIS IS THE MISSING FUNCTION YOU NEED TO ADD 👇
    /// =========================================================
    public entry fun execute_strategy(
        account: &signer,
        strategy_id: String,
        _market_id: String, // Unused but kept for API consistency
        prob_bps: u64,
        sentiment_bps: u64
    ) acquires StrategyStore {
        let owner = signer::address_of(account);

        // 1. Checks
        assert!(exists<StrategyStore>(owner), E_STRATEGY_STORE_NOT_FOUND);
        let store = borrow_global_mut<StrategyStore>(owner);
        assert!(smart_table::contains(&store.strategies, strategy_id), E_STRATEGY_NOT_FOUND);
        
        let strategy = smart_table::borrow_mut(&mut store.strategies, strategy_id);
        assert!(!strategy.executed, E_STRATEGY_ALREADY_EXECUTED);

        // 2. Validate Logic (Price > Min AND Sentiment > Min)
        assert!(prob_bps >= strategy.min_prediction_prob, E_CONDITIONS_NOT_MET);
        assert!(sentiment_bps >= strategy.min_sentiment_score, E_CONDITIONS_NOT_MET);

        // 3. Update State
        strategy.executed = true;

        // 4. Emit Event
        event::emit(StrategyExecuted {
            strategy_id,
            executor: owner,
            prob_bps,
            sentiment_bps,
            amount_traded: strategy.notional_amount,
        });
    }

    #[view]
    public fun get_strategy_state(owner: address, strategy_id: String): (bool, u64, bool) acquires StrategyStore {
        if (!exists<StrategyStore>(owner)) { return (false, 0, false) };
        let store = borrow_global<StrategyStore>(owner);
        if (!smart_table::contains(&store.strategies, strategy_id)) { return (false, 0, false) };
        let s = smart_table::borrow(&store.strategies, strategy_id);
        (true, s.expiry_timestamp, s.executed)
    }
}