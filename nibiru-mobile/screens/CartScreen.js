import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    Alert,
    TextInput

} from "react-native";

import {
    useContext,
    useState,
    useEffect
} from "react";

import {
    SafeAreaView
} from "react-native-safe-area-context";

import AsyncStorage from "@react-native-async-storage/async-storage";

import axios from "axios";

import { AppContext } from "../context/AppContext";

import colors from "../theme/colors";

const API = "http://192.168.1.78:3000";

export default function CartScreen() {

    const {
        cart,
        removeFromCart,
        clearCart
    } = useContext(AppContext);

    /* TIPO DE PEDIDO */
    const [orderType, setOrderType] = useState("local");
    const [paymentMethod, setPaymentMethod] = useState("cash");
    const [addresses, setAddresses] = useState([]);
    const [showNewAddress, setShowNewAddress] = useState(false);

    const [newAddress, setNewAddress] = useState("");

    const [newDetails, setNewDetails] = useState("");

    const [saveAddress, setSaveAddress] = useState(true);

    const [defaultAddress, setDefaultAddress] = useState(false);

    const [selectedAddress, setSelectedAddress] = useState(null);

    /* TOTAL */
    const total = cart.reduce(
        (acc, item) =>
            acc + (item.price * item.quantity),
        0
    );

    useEffect(() => {

        loadAddresses();

    }, []);

    const loadAddresses = async () => {

        try {

            const token = await AsyncStorage.getItem(
                "token"
            );

            const res = await axios.get(
                `${API}/users/addresses`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            setAddresses(res.data);

            const defaultAddress = res.data.find(
                item => item.is_default
            );

            if (defaultAddress) {

                setSelectedAddress(
                    defaultAddress.id
                );
            }

        } catch (err) {

            console.log(
                err?.response?.data || err.message
            );
        }
    };

    const createAddress = async () => {

        if (!newAddress.trim()) {

            Alert.alert(
                "Escribe una dirección"
            );

            return null;
        }

        try {

            const token = await AsyncStorage.getItem(
                "token"
            );

            const res = await axios.post(
                `${API}/users/addresses`,
                {
                    label: "Dirección",
                    address: newAddress,
                    details: newDetails,
                    is_default: defaultAddress
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            loadAddresses();

            setNewAddress("");

            setNewDetails("");

            setShowNewAddress(false);

            return res.data.id;

        } catch (err) {

            console.log(
                err?.response?.data || err.message
            );

            Alert.alert(
                "Error guardando dirección"
            );

            return null;
        }
    };

    /* CREAR PEDIDO */
    const createOrder = async () => {

        if (!cart.length) {

            Alert.alert(
                "Carrito vacío"
            );

            return;
        }

        if (
            orderType === "delivery" &&
            !selectedAddress
        ) {

            Alert.alert(
                "Selecciona una dirección"
            );

            return;
        }

        try {

            const token = await AsyncStorage.getItem(
                "token"
            );

            let finalAddressId = selectedAddress;

            if (
                orderType === "delivery" &&
                showAddress
            ) {

                finalAddressId =
                    await createAddress();

                if (!finalAddressId) {
                    return;
                }
            }

            const items = cart.map(item => ({
                product_id: item.product_id,
                quantity: item.quantity
            }));

            const res = await axios.post(
                `${API}/orders`,
                {
                    items,
                    type: orderType,
                    payment_method: paymentMethod,
                    address_id: finalAddressId
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            console.log(
                "PEDIDO:",
                res.data
            );

            clearCart();

            Alert.alert(
                "Pedido creado"
            );

        } catch (err) {

            console.log(
                err?.response?.data || err.message
            );

            Alert.alert(
                "Error creando pedido"
            );
        }
    };

    return (

        <SafeAreaView style={styles.container}>

            <Text style={styles.title}>
                Carrito
            </Text>

            <FlatList
                data={cart}
                keyExtractor={(item) =>
                    item.product_id.toString()
                }
                renderItem={({ item }) => (

                    <View style={styles.card}>

                        <Text style={styles.name}>
                            {item.name}
                        </Text>

                        <Text style={styles.quantity}>
                            x{item.quantity}
                        </Text>

                        <Text style={styles.price}>
                            ${item.price * item.quantity}
                        </Text>

                        <TouchableOpacity
                            style={styles.remove}
                            onPress={() =>
                                removeFromCart(
                                    item.product_id
                                )
                            }
                        >

                            <Text style={styles.removeText}>
                                Eliminar
                            </Text>

                        </TouchableOpacity>

                    </View>
                )}
            />

            <View style={styles.footer}>

                {/* TIPOS */}

                <View style={styles.types}>

                    <TouchableOpacity
                        style={[
                            styles.typeButton,
                            orderType === "local" &&
                            styles.typeActive
                        ]}
                        onPress={() =>
                            setOrderType("local")
                        }
                    >

                        <Text style={[
                            styles.typeText,
                            orderType === "local" &&
                            styles.typeTextActive
                        ]}>
                            Local
                        </Text>

                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.typeButton,
                            orderType === "pickup" &&
                            styles.typeActive
                        ]}
                        onPress={() =>
                            setOrderType("pickup")
                        }
                    >

                        <Text style={[
                            styles.typeText,
                            orderType === "pickup" &&
                            styles.typeTextActive
                        ]}>
                            Para llevar
                        </Text>

                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.typeButton,
                            orderType === "delivery" &&
                            styles.typeActive
                        ]}
                        onPress={() =>
                            setOrderType("delivery")
                        }
                    >

                        <Text style={[
                            styles.typeText,
                            orderType === "delivery" &&
                            styles.typeTextActive
                        ]}>
                            Domicilio
                        </Text>

                    </TouchableOpacity>

                </View>

                <Text style={styles.sectionTitle}>
                    Método de pago
                </Text>

                <View style={styles.types}>

                    <TouchableOpacity
                        style={[
                            styles.typeButton,
                            paymentMethod === "cash" &&
                            styles.typeActive
                        ]}
                        onPress={() =>
                            setPaymentMethod("cash")
                        }
                    >

                        <Text style={[
                            styles.typeText,
                            paymentMethod === "cash" &&
                            styles.typeTextActive
                        ]}>
                            Efectivo
                        </Text>

                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.typeButton,
                            paymentMethod === "card" &&
                            styles.typeActive
                        ]}
                        onPress={() =>
                            setPaymentMethod("card")
                        }
                    >

                        <Text style={[
                            styles.typeText,
                            paymentMethod === "card" &&
                            styles.typeTextActive
                        ]}>
                            Tarjeta
                        </Text>



                    </TouchableOpacity>


                </View>

                {
                    orderType === "delivery" && (

                        <View style={styles.addressSection}>

                            <Text style={styles.sectionTitle}>
                                Dirección
                            </Text>

                            {
                                addresses.map((item) => (

                                    <TouchableOpacity
                                        key={item.id}
                                        style={[
                                            styles.addressCard,

                                            selectedAddress === item.id &&
                                            styles.addressActive
                                        ]}
                                        onPress={() =>
                                            setSelectedAddress(item.id)
                                        }
                                    >

                                        <Text style={[
                                            styles.addressText,

                                            selectedAddress === item.id &&
                                            styles.addressTextActive
                                        ]}>
                                            {item.address}
                                        </Text>

                                        {
                                            item.details ? (

                                                <Text style={[
                                                    styles.addressDetails,

                                                    selectedAddress === item.id &&
                                                    styles.addressTextActive
                                                ]}>
                                                    {item.details}
                                                </Text>

                                            ) : null
                                        }

                                    </TouchableOpacity>
                                ))


                            }

                            <TouchableOpacity
                                style={styles.addButton}
                                onPress={() =>
                                    setShowNewAddress(
                                        !showNewAddress
                                    )
                                }
                            >

                                <Text style={styles.addButtonText}>
                                    + Agregar dirección
                                </Text>

                            </TouchableOpacity>

                            {
                                showNewAddress && (

                                    <View style={styles.form}>

                                        <TextInput
                                            placeholder="Dirección"
                                            placeholderTextColor="#999"
                                            value={newAddress}
                                            onChangeText={setNewAddress}
                                            style={styles.input}
                                        />

                                        <TextInput
                                            placeholder="Referencias"
                                            placeholderTextColor="#999"
                                            value={newDetails}
                                            onChangeText={setNewDetails}
                                            style={styles.input}
                                        />

                                        <TouchableOpacity
                                            style={[
                                                styles.optionButton,

                                                saveAddress &&
                                                styles.optionActive
                                            ]}
                                            onPress={() =>
                                                setSaveAddress(
                                                    !saveAddress
                                                )
                                            }
                                        >

                                            <Text style={[
                                                styles.optionText,

                                                saveAddress &&
                                                styles.optionTextActive
                                            ]}>
                                                Guardar dirección
                                            </Text>

                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.optionButton,

                                                defaultAddress &&
                                                styles.optionActive
                                            ]}
                                            onPress={() =>
                                                setDefaultAddress(
                                                    !defaultAddress
                                                )
                                            }
                                        >

                                            <Text style={[
                                                styles.optionText,

                                                defaultAddress &&
                                                styles.optionTextActive
                                            ]}>
                                                Usar por defecto
                                            </Text>

                                        </TouchableOpacity>

                                    </View>
                                )
                            }

                        </View>
                    )
                }

                {/* TOTAL */}

                <Text style={styles.total}>
                    Total: ${total}
                </Text>

                {/* BOTÓN */}

                <TouchableOpacity
                    style={styles.button}
                    onPress={createOrder}
                >

                    <Text style={styles.buttonText}>
                        Crear pedido
                    </Text>

                </TouchableOpacity>

            </View>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({

    container: {
        flex: 1,
        padding: 16,
        backgroundColor: colors.background
    },

    title: {
        fontSize: 28,
        fontWeight: "700",
        marginBottom: 20,
        color: colors.text
    },

    card: {
        backgroundColor: "#fff",
        padding: 18,
        borderRadius: 18,
        marginBottom: 14
    },

    name: {
        fontSize: 18,
        fontWeight: "700",
        color: colors.text
    },

    quantity: {
        marginTop: 5,
        color: colors.muted
    },

    price: {
        marginTop: 8,
        color: colors.primary,
        fontWeight: "700"
    },

    remove: {
        marginTop: 14,
        backgroundColor: "#EF4444",
        padding: 12,
        borderRadius: 12,
        alignItems: "center"
    },

    removeText: {
        color: "#fff",
        fontWeight: "700"
    },

    footer: {
        marginTop: 10
    },

    types: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 20
    },

    typeButton: {
        flex: 1,
        backgroundColor: "#fff",
        padding: 14,
        borderRadius: 14,
        marginHorizontal: 4,
        alignItems: "center"
    },

    typeActive: {
        backgroundColor: colors.primary
    },

    typeText: {
        color: colors.text,
        fontWeight: "700"
    },

    typeTextActive: {
        color: "#fff"
    },

    total: {
        fontSize: 24,
        fontWeight: "700",
        marginBottom: 16,
        color: colors.text
    },

    button: {
        backgroundColor: colors.primary,
        padding: 18,
        borderRadius: 16,
        alignItems: "center"
    },

    buttonText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 16
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "700",
        marginBottom: 12,
        color: colors.text
    },

    addressSection: {
        marginBottom: 20
    },

    addressCard: {
        backgroundColor: "#fff",
        padding: 14,
        borderRadius: 14,
        marginBottom: 10
    },

    addressActive: {
        backgroundColor: colors.primary
    },

    addressText: {
        color: colors.text,
        fontWeight: "700"
    },

    addressDetails: {
        marginTop: 6,
        color: colors.muted
    },

    addressTextActive: {
        color: "#fff"
    },

    addButton: {
        marginTop: 10,
        marginBottom: 14
    },

    addButtonText: {
        color: colors.primary,
        fontWeight: "700"
    },

    form: {
        marginTop: 10
    },

    input: {
        backgroundColor: "#fff",
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
        color: colors.text
    },

    optionButton: {
        backgroundColor: "#fff",
        padding: 14,
        borderRadius: 14,
        marginBottom: 10
    },

    optionActive: {
        backgroundColor: colors.primary
    },

    optionText: {
        color: colors.text,
        fontWeight: "700"
    },

    optionTextActive: {
        color: "#fff"
    },

});