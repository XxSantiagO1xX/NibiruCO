import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    RefreshControl
} from "react-native";

import {
    useEffect,
    useState,
    useCallback
} from "react";

import {
    SafeAreaView
} from "react-native-safe-area-context";

import {
    useFocusEffect
} from "@react-navigation/native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import axios from "axios";

import colors from "../theme/colors";

import {
    TouchableOpacity,
    Alert
} from "react-native";

const API = "http://192.168.1.86:3000";

export default function OrdersScreen() {

    const [orders, setOrders] = useState([]);

    const [tab, setTab] = useState("active");

    const [loading, setLoading] = useState(true);

    const [refreshing, setRefreshing] = useState(false);

    /* CARGAR PEDIDOS */

    const loadOrders = async () => {

        try {

            const token = await AsyncStorage.getItem(
                "token"
            );

            const res = await axios.get(
                `${API}/orders`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            setOrders(res.data);

        } catch (err) {

            console.log(
                "ERROR ORDERS:",
                err?.response?.data || err.message
            );

        } finally {

            setLoading(false);

            setRefreshing(false);
        }
    };

    const cancelOrder = async (id) => {

        try {

            const token = await AsyncStorage.getItem(
                "token"
            );

            await axios.patch(
                `${API}/orders/${id}/cancel`,
                {},
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            Alert.alert(
                "Pedido cancelado"
            );

            loadOrders();

        } catch (err) {

            console.log(
                err?.response?.data || err.message
            );

            Alert.alert(
                "No se pudo cancelar"
            );
        }
    };

    /* REFRESH */

    const onRefresh = useCallback(() => {

        setRefreshing(true);

        loadOrders();

    }, []);

    useFocusEffect(
        useCallback(() => {

            loadOrders();

        }, [])
    );

    /* ESTADO COLOR */

    const getStatusColor = (status) => {

        if (status === "pendiente") {
            return "#F59E0B";
        }

        if (status === "entregado") {
            return "#22C55E";
        }

        if (status === "cancelado") {
            return "#EF4444";
        }

        return "#64748B";
    };

    /* TIPO TEXTO */

    const getTypeText = (type) => {

        if (type === "local") {
            return "Local";
        }

        if (type === "pickup") {
            return "Para llevar";
        }

        if (type === "delivery") {
            return "Domicilio";
        }

        return type;
    };

    const activeOrders = orders.filter(order =>
        ["pendiente", "aceptado", "preparando", "listo"]
            .includes(order.status?.toLowerCase())
    );

    const historyOrders = orders.filter(order =>
        ["entregado", "cancelado"]
            .includes(order.status?.toLowerCase())
    );

    /* LOADING */

    if (loading) {

        return (

            <View style={styles.loading}>

                <ActivityIndicator
                    size="large"
                    color={colors.primary}
                />

            </View>
        );
    }

    return (

        <SafeAreaView style={styles.container}>

            <Text style={styles.title}>
                Mis pedidos
            </Text>

            <View style={styles.tabs}>

                <TouchableOpacity
                    style={styles.tabButton}
                    onPress={() => setTab("active")}
                >

                    <Text style={[
                        styles.tabText,
                        tab === "active" &&
                        styles.tabActive
                    ]}>
                        Comprados
                    </Text>

                    {
                        tab === "active" &&
                        <View style={styles.line} />
                    }

                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.tabButton}
                    onPress={() => setTab("history")}
                >

                    <Text style={[
                        styles.tabText,
                        tab === "history" &&
                        styles.tabActive
                    ]}>
                        Historial
                    </Text>

                    {
                        tab === "history" &&
                        <View style={styles.line} />
                    }

                </TouchableOpacity>

            </View>

            <FlatList
                data={
                    tab === "active"
                        ? activeOrders
                        : historyOrders
                }
                keyExtractor={(item) =>
                    item.id.toString()
                }
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                    />
                }
                ListEmptyComponent={

                    <View style={styles.empty}>

                        <Text style={styles.emptyText}>
                            {
                                tab === "active"
                                    ? "Aún no hay compras aquí"
                                    : "No hay historial todavía"
                            }
                        </Text>

                    </View>
                }
                renderItem={({ item }) => (

                    <View style={styles.card}>

                        {/* HEADER */}

                        <View style={styles.row}>

                            <Text style={styles.orderId}>
                                Pedido #{item.id}
                            </Text>

                            <View style={[
                                styles.status,
                                {
                                    backgroundColor:
                                        getStatusColor(item.status)
                                }
                            ]}>

                                <Text style={styles.statusText}>
                                    {item.status}
                                </Text>

                            </View>

                        </View>

                        {/* INFO */}

                        <Text style={styles.type}>
                            Tipo:
                            {" "}
                            {getTypeText(item.type)}
                        </Text>
                        <Text style={styles.type}>
                            Pago:
                            {" "}
                            {
                                item.payment_method === "card"
                                    ? "Tarjeta"
                                    : "Efectivo"
                            }
                        </Text>

                        <Text style={styles.total}>
                            Total:
                            {" "}
                            ${item.total}
                        </Text>

                        <Text style={styles.date}>
                            {new Date(
                                item.created_at
                            ).toLocaleString()}
                        </Text>

                        {
                            item.status === "pendiente" && (

                                <TouchableOpacity
                                    style={styles.cancelButton}
                                    onPress={() =>
                                        cancelOrder(item.id)
                                    }
                                >

                                    <Text style={styles.cancelText}>
                                        Cancelar pedido
                                    </Text>

                                </TouchableOpacity>
                            )
                        }

                    </View>
                )}
            />

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({

    container: {
        flex: 1,
        backgroundColor: colors.background,
        padding: 16
    },

    loading: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center"
    },

    title: {
        fontSize: 30,
        fontWeight: "700",
        marginBottom: 20,
        color: colors.text
    },

    card: {
        backgroundColor: "#fff",
        padding: 20,
        borderRadius: 20,
        marginBottom: 14,

        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 10,

        elevation: 3
    },

    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center"
    },

    orderId: {
        fontSize: 20,
        fontWeight: "700",
        color: colors.text
    },

    status: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12
    },

    statusText: {
        color: "#fff",
        fontWeight: "700",
        textTransform: "capitalize"
    },

    type: {
        marginTop: 16,
        color: colors.text,
        fontSize: 16
    },

    total: {
        marginTop: 10,
        fontSize: 18,
        fontWeight: "700",
        color: colors.primary
    },

    date: {
        marginTop: 12,
        color: colors.muted,
        fontSize: 14
    },

    empty: {
        marginTop: 80,
        alignItems: "center"
    },

    emptyText: {
        color: colors.muted,
        fontSize: 16
    },

    cancelButton: {
        marginTop: 16,
        backgroundColor: "#EF4444",
        padding: 14,
        borderRadius: 14,
        alignItems: "center"
    },

    cancelText: {
        color: "#fff",
        fontWeight: "700"
    },

    tabs: {
        flexDirection: "row",
        marginBottom: 24
    },

    tabButton: {
        marginRight: 28
    },

    tabText: {
        fontSize: 20,
        color: colors.muted,
        fontWeight: "500"
    },

    tabActive: {
        color: colors.text,
        fontWeight: "700"
    },

    line: {
        marginTop: 6,
        height: 4,
        width: 40,
        borderRadius: 10,
        backgroundColor: colors.primary
    },
});