import type { Metadata } from "next";
import { LegalLayout, H } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Exclusão de Dados · DashMonster",
  description: "Como solicitar a exclusão dos seus dados no DashMonster.",
};

export default function DataDeletionPage() {
  return (
    <LegalLayout title="Exclusão de Dados" updated="17 de julho de 2026">
      <p>
        Esta página explica como excluir os dados associados à sua conta no <strong>DashMonster</strong>,
        conforme exigido pelos Termos da Plataforma Meta e pela LGPD.
      </p>

      <H>Desconectar a Meta (revoga o token)</H>
      <p>
        Nas configurações da empresa dentro do DashMonster, use <em>Desconectar</em> na conexão do
        Facebook/Instagram/WhatsApp. Isso revoga e apaga imediatamente o token de acesso guardado no
        nosso servidor. Você também pode remover o app em{" "}
        <a href="https://www.facebook.com/settings?tab=business_tools" className="underline" target="_blank" rel="noopener noreferrer">
          Configurações → Integrações de Negócios
        </a>{" "}
        do seu Facebook.
      </p>

      <H>Excluir todos os seus dados</H>
      <p>Para apagar por completo os dados da sua conta e da sua empresa (métricas, leads, conversas, eventos de rastreamento e tokens), envie um pedido por um dos caminhos:</p>
      <ul>
        <li>
          Email para{" "}
          <a href="mailto:contato@dashmonster.com.br?subject=Exclus%C3%A3o%20de%20dados" className="underline">
            contato@dashmonster.com.br
          </a>{" "}
          com o assunto &quot;Exclusão de dados&quot;, a partir do email da sua conta; ou
        </li>
        <li>a opção de exclusão de conta nas configurações, quando disponível.</li>
      </ul>
      <p>
        Confirmaremos o recebimento e concluiremos a exclusão em até <strong>30 dias</strong>,
        removendo os dados dos nossos sistemas e dos backups no ciclo seguinte de rotação. Alguns
        registros podem ser retidos apenas quando exigido por obrigação legal.
      </p>

      <H>Contato</H>
      <p>
        <a href="mailto:contato@dashmonster.com.br" className="underline">contato@dashmonster.com.br</a>
      </p>
    </LegalLayout>
  );
}
